import 'dotenv/config';

export type Config = {
  notionToken: string;
  notionDatabaseId: string;
  docsDir: string;
  concurrency: number;
};

export function loadConfig(): Config {
  const notionToken = process.env.NOTION_TOKEN || '';
  const notionDatabaseId = process.env.NOTION_DATABASE_ID || '';
  const docsDir = process.env.DOCS_DIR || 'docs';
  const concurrency = Number(process.env.CONCURRENCY || 6);

  if (!notionToken || !notionDatabaseId) {
    throw new Error('Set NOTION_TOKEN and NOTION_DATABASE_ID in .env');
  }
  return { notionToken, notionDatabaseId, docsDir, concurrency };
}
