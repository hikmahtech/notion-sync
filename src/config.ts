import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';

export type Config = {
  notionToken: string;
  notionDatabaseId: string;
  docsDir: string;
  concurrency: number;
  projectName: string;
};

function getProjectName(): string {
  // Try PROJECT_NAME environment variable first
  const envProjectName = process.env.PROJECT_NAME;
  if (envProjectName) {
    return envProjectName;
  }

  // Try to get from git remote
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const match = remoteUrl.match(/\/([^\/]+?)(?:\.git)?$/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    // Git remote not available, continue to next fallback
  }

  // Fallback to current directory name
  return path.basename(process.cwd());
}

export function loadConfig(): Config {
  const notionToken = process.env.NOTION_TOKEN || '';
  const notionDatabaseId = process.env.NOTION_DATABASE_ID || '';
  const docsDir = process.env.DOCS_DIR || 'docs';
  const concurrency = Number(process.env.CONCURRENCY || 6);
  const projectName = getProjectName();

  if (!notionToken || !notionDatabaseId) {
    throw new Error('Set NOTION_TOKEN and NOTION_DATABASE_ID in .env');
  }
  return { notionToken, notionDatabaseId, docsDir, concurrency, projectName };
}
