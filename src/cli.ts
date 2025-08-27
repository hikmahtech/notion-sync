#!/usr/bin/env node
import { pushAll, pullAll, precommitCheck } from './sync.js';
import { loadConfig } from './config.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const cmd = process.argv[2];

(async () => {
  try {
    switch (cmd) {
      case 'init': {
        const cfg = loadConfig();
        await fs.mkdir(cfg.docsDir, { recursive: true });
        const example = `---\ntitle: Example Doc
notion_page_id:
doc_uid:
last_sync_at:
last_hash_fs:
last_hash_notion:
---\n
# Example

- Edit here or in Notion.
- Code blocks and bullets round-trip.


python
print("ok")


`;
        await fs.writeFile(path.join(cfg.docsDir, 'example.md'), example, 'utf8');
        console.log(`Initialized ${cfg.docsDir}/example.md`);
        break;
      }
      case 'push':
        await pushAll();
        break;
      case 'pull':
        await pullAll();
        break;
      case 'precommit-check': {
        const rc = await precommitCheck();
        process.exit(rc);
      }
      default:
        console.error('Usage: notion-sync <init|push|pull|precommit-check>');
        process.exit(2);
    }
  } catch (e: any) {
    console.error(e?.message || e);
    process.exit(1);
  }
})();
