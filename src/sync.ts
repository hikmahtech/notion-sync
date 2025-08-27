import { glob } from 'glob';
import path from 'node:path';
import pLimit from 'p-limit';
import { loadConfig } from './config.js';
import { readDoc, writeDoc, hashBody, Doc } from './mdio.js';
import { mdToBlocks, blocksToMd } from './mdBlocks.js';
import { notionClient, createPage, updateProps, replaceChildren, listChildren, queryByTitle, queryByProjectName, getLastEdited } from './notion.js';

const NOTION_PROP_DOC_UID = 'doc_uid';
const NOTION_PROP_ARCHIVED = 'archived';
const NOTION_PROP_PROJECT_NAME = 'project_name';

export async function pushAll() {
  const cfg = loadConfig();
  const notion = notionClient(cfg.notionToken);
  const files = glob.sync(path.join(cfg.docsDir, '**/*.md').replace(/\\/g, '/'));
  const limit = pLimit(cfg.concurrency);
  await Promise.all(files.map((f: string) => limit(() => pushOne(notion, cfg.notionDatabaseId, f))));
}

export async function pullAll() {
  const cfg = loadConfig();
  const notion = notionClient(cfg.notionToken);
  const limit = pLimit(cfg.concurrency);

  // Get all Notion pages for this project
  const notionPages = await queryByProjectName(notion, cfg.notionDatabaseId, cfg.projectName);
  
  // Get all local files with their doc_uid
  const files = glob.sync(path.join(cfg.docsDir, '**/*.md').replace(/\\/g, '/'));
  const localDocs = new Map<string, string>(); // doc_uid -> filePath
  
  for (const filePath of files) {
    try {
      const doc = await readDoc(filePath);
      if (doc.front.doc_uid) {
        localDocs.set(doc.front.doc_uid, filePath);
      }
    } catch (error) {
      console.warn(`Could not read file ${filePath}:`, error);
    }
  }

  // Process each Notion page
  const pullTasks = notionPages.map((page: any) => 
    limit(() => pullPageFromNotion(notion, page, localDocs, cfg.docsDir))
  );

  await Promise.all(pullTasks);
}

async function pullPageFromNotion(notion: any, notionPage: any, localDocs: Map<string, string>, docsDir: string) {
  // Extract doc_uid from Notion page properties
  let docUidProp = notionPage.properties?.[NOTION_PROP_DOC_UID]?.rich_text?.[0]?.text?.content;
  const pageTitle = notionPage.properties?.Name?.title?.[0]?.text?.content || 'Untitled';
  
  // If doc_uid is missing, generate one and update Notion
  if (!docUidProp) {
    const crypto = await import('node:crypto');
    docUidProp = crypto.randomUUID();
    console.log(`Generating doc_uid for "${pageTitle}": ${docUidProp}`);
    
    // Update Notion with the new doc_uid
    await updateProps(notion, notionPage.id, {
      [NOTION_PROP_DOC_UID]: { rich_text: [{ type: 'text', text: { content: docUidProp } }] }
    });
  }

  // Check if we have this document locally
  const localFilePath = localDocs.get(docUidProp);
  
  if (localFilePath) {
    // Update existing local file
    await pullOne(notion, localFilePath);
  } else {
    // Create new local file for this Notion page
    await createLocalFileFromNotion(notion, notionPage, docUidProp, pageTitle, docsDir);
  }
}

async function createLocalFileFromNotion(notion: any, notionPage: any, docUid: string, pageTitle: string, docsDir: string) {
  try {
    // Get page content from Notion
    const blocks = await listChildren(notion, notionPage.id);
    const body = blocksToMd(blocks);
    const bodyHash = hashBody(body);

    // Create filename from title (sanitize for filesystem)
    const sanitizedTitle = pageTitle
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    const fileName = `${sanitizedTitle}.md`;
    const filePath = path.join(docsDir, fileName);

    // Check if file already exists with different name, if so append number
    let finalPath = filePath;
    let counter = 1;
    const fs = await import('node:fs/promises');
    
    while (await fs.access(finalPath).then(() => true).catch(() => false)) {
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      finalPath = path.join(docsDir, `${base}-${counter}${ext}`);
      counter++;
    }

    // Create the document with proper front-matter
    const doc: Doc = {
      path: finalPath,
      front: {
        title: pageTitle,
        notion_page_id: notionPage.id,
        doc_uid: docUid,
        last_sync_at: new Date().toISOString(),
        last_hash_fs: bodyHash,
        last_hash_notion: bodyHash,
        archived: notionPage.properties?.[NOTION_PROP_ARCHIVED]?.checkbox || false
      },
      body: body
    };

    await writeDoc(doc);
    console.log(`Created new local file: ${finalPath}`);
  } catch (error) {
    console.error(`Failed to create local file for "${pageTitle}":`, error);
  }
}

export async function pushOne(notion: any, dbid: string, filePath: string) {
  const cfg = loadConfig();
  const doc = await readDoc(filePath);
  const bodyHash = hashBody(doc.body);
  const children = mdToBlocks(doc.body);
  const props = ensureProps(doc, cfg.projectName);

  let pageId = doc.front.notion_page_id as string | undefined;

  if (!pageId) {
    const found = await queryByTitle(notion, dbid, doc.front.title);
    if (found.length) {
      pageId = found[0].id;
    } else {
      pageId = await createPage(notion, dbid, doc.front.title, props, children);
    }
    doc.front.notion_page_id = pageId;
  } else {
    await updateProps(notion, pageId, props);
    await replaceChildren(notion, pageId, children);
  }

  doc.front.last_hash_fs = bodyHash;
  doc.front.last_hash_notion = bodyHash;
  doc.front.last_sync_at = new Date().toISOString();
  await writeDoc(doc);
}

export async function pullOne(notion: any, filePath: string) {
  const doc = await readDoc(filePath);
  const pageId = doc.front.notion_page_id as string | undefined;
  if (!pageId) return;

  const blocks = await listChildren(notion, pageId);
  const md = blocksToMd(blocks);
  const notionHash = hashBody(md);
  const lastHashFs = doc.front.last_hash_fs;
  const lastHashNotion = doc.front.last_hash_notion;

  if (notionHash !== lastHashNotion && lastHashFs === lastHashNotion) {
    // accept Notion
    doc.body = md;
    doc.front.last_hash_fs = notionHash;
    doc.front.last_hash_notion = notionHash;
    doc.front.last_sync_at = new Date().toISOString();
    await writeDoc(doc);
  } else if (notionHash !== lastHashNotion && lastHashFs !== lastHashNotion) {
    const conflictPath = filePath + '.conflict';
    const payload = [
      '<<<<<<< FILE SYSTEM',
      doc.body,
      '=======',
      md,
      '>>>>>>> NOTION'
    ].join('\n');
    await (await import('node:fs/promises')).writeFile(conflictPath, payload, 'utf8');
    throw new Error(`Conflict: ${conflictPath}`);
  }
}

export async function precommitCheck(): Promise<number> {
  const cfg = loadConfig();
  const notion = notionClient(cfg.notionToken);
  const files = glob.sync(path.join(cfg.docsDir, '**/*.md').replace(/\\/g, '/'));
  const bad: string[] = [];
  for (const f of files) {
    const doc = await readDoc(f);
    if (!doc.front.notion_page_id) continue;
    const edited = await getLastEdited(notion, doc.front.notion_page_id);
    const last = doc.front.last_sync_at || '';
    if (edited > last) bad.push(f);
  }
  if (bad.length) {
    console.error('Pull required before commit:\n' + bad.join('\n'));
    return 1;
  }
  return 0;
}

function ensureProps(doc: Doc, projectName: string) {
  return {
    [NOTION_PROP_DOC_UID]: { rich_text: [{ type: 'text', text: { content: String(doc.front.doc_uid) } }] },
    [NOTION_PROP_ARCHIVED]: { checkbox: !!doc.front.archived },
    [NOTION_PROP_PROJECT_NAME]: { rich_text: [{ type: 'text', text: { content: projectName } }] }
  };
}