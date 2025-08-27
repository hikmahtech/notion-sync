import { glob } from 'glob';
import path from 'node:path';
import pLimit from 'p-limit';
import { loadConfig } from './config.js';
import { readDoc, writeDoc, hashBody, Doc } from './mdio.js';
import { mdToBlocks, blocksToMd } from './mdBlocks.js';
import { notionClient, createPage, updateProps, replaceChildren, listChildren, queryByTitle, getLastEdited } from './notion.js';

const NOTION_PROP_DOC_UID = 'doc_uid';
const NOTION_PROP_ARCHIVED = 'archived';

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
  const files = glob.sync(path.join(cfg.docsDir, '**/*.md').replace(/\\/g, '/'));
  const limit = pLimit(cfg.concurrency);
  await Promise.all(files.map((f: string) => limit(() => pullOne(notion, f))));
}

export async function pushOne(notion: any, dbid: string, filePath: string) {
  const doc = await readDoc(filePath);
  const bodyHash = hashBody(doc.body);
  const children = mdToBlocks(doc.body);
  const props = ensureProps(doc);

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

function ensureProps(doc: Doc) {
  return {
    [NOTION_PROP_DOC_UID]: { rich_text: [{ type: 'text', text: { content: String(doc.front.doc_uid) } }] },
    [NOTION_PROP_ARCHIVED]: { checkbox: !!doc.front.archived }
  };
}