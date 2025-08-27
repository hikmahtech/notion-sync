import { Client } from '@notionhq/client';

export function notionClient(token: string) {
  return new Client({ auth: token });
}

export async function createPage(notion: Client, databaseId: string, title: string, props: Record<string, any>, children: any[]) {
  const res = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: { Name: { title: [{ text: { content: title } }] }, ...props },
    children
  } as any);
  return res.id;
}

export async function updateProps(notion: Client, pageId: string, props: Record<string, any>) {
  await notion.pages.update({ page_id: pageId, properties: props });
}

export async function listChildren(notion: Client, blockId: string) {
  const out: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    out.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

export async function replaceChildren(notion: Client, pageId: string, children: any[]) {
  // delete old
  const exist = await listChildren(notion, pageId);
  for (const ch of exist) {
    await notion.blocks.update({ block_id: ch.id, archived: true });
  }
  // append in chunks
  for (let i = 0; i < children.length; i += 100) {
    await notion.blocks.children.append({ block_id: pageId, children: children.slice(i, i + 100) });
  }
}

export async function queryByTitle(notion: Client, databaseId: string, title: string) {
  const res = await notion.databases.query({
    database_id: databaseId,
    filter: { property: 'Name', title: { equals: title } },
    page_size: 5
  } as any);
  return res.results;
}

export async function getLastEdited(notion: Client, pageId: string): Promise<string> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  return (page as any).last_edited_time as string;
}
