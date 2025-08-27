import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';

export type Doc = {
  path: string;
  front: Record<string, any>;
  body: string;
};

export async function readDoc(fp: string): Promise<Doc> {
  const text = await fs.readFile(fp, 'utf8');
  const parsed = matter(text);
  const front = parsed.data ?? {};
  if (!front.doc_uid) front.doc_uid = crypto.randomUUID();
  if (!front.title) front.title = guessTitle(parsed.content, path.basename(fp, '.md'));
  return { path: fp, front, body: parsed.content };
}

export async function writeDoc(doc: Doc): Promise<void> {
  const fm = matter.stringify(doc.body, doc.front, { language: 'yaml' });
  await fs.writeFile(doc.path, fm, 'utf8');
}

export function hashBody(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function guessTitle(content: string, fallback: string): string {
  const h1 = content.split('\n').find(l => l.startsWith('# '));
  return h1 ? h1.slice(2).trim() : fallback;
}
