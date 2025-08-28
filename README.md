# Notion ↔ Markdown Sync

A TypeScript CLI tool that provides two-way synchronization between Markdown files in a `docs/` directory and Notion pages.

- **Edit locally** → push to Notion
- **Edit in Notion** → pull to files  
- **If both changed** → create conflict files for manual resolution

## Features

- One-to-one mapping: each `.md` file syncs with one Notion page
- Conflict detection and resolution using content hashes
- Support for headers (H1/H2), paragraphs, bullet lists, and fenced code blocks
- Parallel sync operations with configurable concurrency
- Front-matter metadata tracking for sync state
- GitHub Actions workflow for automated syncing
- **Automatic chunking**: Handles large documents (>100 blocks) and code blocks (>2000 characters)
- **Smart categorization**: Extracts categories from filenames (e.g., `api_health-monitoring.md` → "Api Health: Monitoring")

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd notion-pm-sync
npm install
npm run build
```

### 2. Set up Notion

1. Create a Notion integration at [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create a database in Notion with these properties:
   - **Name** (title) - automatically synced
   - **doc_uid** (rich text) - for tracking files
   - **project_name** (rich text) - for project identification
   - **archived** (checkbox) - for soft deletes
3. Share your database with the integration

### 3. Configure Environment

Create a `.env` file:

```bash
NOTION_TOKEN=secret_your_integration_token
NOTION_DATABASE_ID=your_database_id
DOCS_DIR=docs
CONCURRENCY=6
PROJECT_NAME=my-project
```

### 4. Initialize and Sync

```bash
# Create docs directory and example file
npm run dev init

# Push local files to Notion
npm run dev push

# Pull changes from Notion
npm run dev pull
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Create `docs/` directory with example file |
| `push` | Upload local markdown changes to Notion |
| `pull` | Download Notion changes to local files |
| `precommit-check` | Verify no pending Notion changes before commit |

### Development Commands

```bash
# Run without building
npm run dev <command>

# Build TypeScript
npm run build

# Run built version
node dist/cli.js <command>

# Lint code
npm run lint
```

## File Structure

Each markdown file in `docs/` includes front-matter metadata:

```yaml
---
title: My Document
notion_page_id: abc123-def456-ghi789
doc_uid: immutable-uuid-here
last_sync_at: 2025-08-27T07:00:00Z
last_hash_fs: sha256-hash-of-file-content
last_hash_notion: sha256-hash-of-notion-content
archived: false
---

# My Document

Your markdown content here...
```

### Smart Categorization

File names with categories are automatically formatted in Notion:

- `api_health-monitoring.md` → **"Api Health: Monitoring"**
- `database_migration-rollback_strategy.md` → **"Database Migration: Rollback Strategy"**  
- `user_auth-session_management.md` → **"User Auth: Session Management"**

The category (text before first hyphen) is converted to proper case and separated with a colon.

## Conflict Resolution

When both local and Notion versions have changed since the last sync:

1. A `.conflict` file is created with both versions
2. The sync operation fails with a non-zero exit code
3. Manually resolve conflicts and run sync again

Example conflict file:
```
<<<<<<< FILE SYSTEM
Local version of content
=======
Notion version of content
>>>>>>> NOTION
```

## Supported Markdown Elements

The tool supports round-trip conversion for:

- **Headers**: `# H1` and `## H2`
- **Paragraphs**: Regular text blocks
- **Bullet lists**: `- List items`
- **Code blocks**: Fenced code with language specification

Other Markdown elements may not sync properly between platforms.

## Docker Usage

Build and run with Docker:

```bash
docker build -t notion-sync .
docker run --rm -v $PWD:/app -e NOTION_TOKEN -e NOTION_DATABASE_ID notion-sync pull
```

## GitHub Actions

The included workflow (`.github/workflows/notion-sync.yml`) automatically:

- Pulls changes from Notion every 30 minutes
- Syncs when markdown files are pushed to the repository
- Commits any changes back to the repository

Configure these secrets in your repository:
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

## Pre-commit Hook

Prevent commits when Notion has pending changes:

```bash
npx husky add .husky/pre-commit 'node dist/cli.js precommit-check'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTION_TOKEN` | Required | Your Notion integration token |
| `NOTION_DATABASE_ID` | Required | ID of your Notion database |
| `DOCS_DIR` | `docs` | Directory containing markdown files |
| `CONCURRENCY` | `6` | Number of parallel sync operations |
| `PROJECT_NAME` | Git repo name or directory name | Project identifier sent to Notion |

## Limitations

- **Rate limits**: Notion API has rate limits; consider adding retry logic for production use
- **Block support**: Limited to basic Markdown elements that round-trip safely
- **Large content**: Automatically handles Notion's limits by chunking large documents (>100 blocks) and splitting code blocks (>2000 characters)
- **Deletes**: Use soft-delete by setting `archived: true` in front-matter

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` to check code style
5. Test your changes
6. Submit a pull request

## License

MIT License - see LICENSE file for details.