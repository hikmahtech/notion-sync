// Round-trip limited subset: h1, h2, paragraph, - list, fenced code.
export type Block = Record<string, any>;

export function mdToBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    if (ln.startsWith('# ')) {
      out.push(h('heading_1', ln.slice(2).trim())); continue;
    }
    if (ln.startsWith('## ')) {
      out.push(h('heading_2', ln.slice(3).trim())); continue;
    }
    if (ln.startsWith('- ')) {
      out.push(bulleted(ln.slice(2).trim())); continue;
    }
    if (ln.startsWith('```')) {
      const lang = ln.slice(3).trim() || 'plain text';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      out.push(code(lang, buf.join('\n')));
      continue;
    }
    if (ln.trim().length > 0) {
      out.push(paragraph(ln.trim()));
    }
  }
  return out;
}

export function blocksToMd(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    const t = b.type;
    if (t === 'heading_1') out.push('# ' + texts(b[t].rich_text));
    else if (t === 'heading_2') out.push('## ' + texts(b[t].rich_text));
    else if (t === 'bulleted_list_item') out.push('- ' + texts(b[t].rich_text));
    else if (t === 'code') {
      const lang = b[t].language || '';
      out.push('```' + lang);
      out.push(texts(b[t].rich_text));
      out.push('```');
    } else if (t === 'paragraph') out.push(texts(b[t].rich_text));
  }
  return out.join('\n').trim() + '\n';
}

const txt = (s: string) => ({ type: 'text', text: { content: s } });
const rt = (s: string) => [{ type: 'text', text: { content: s } }];

const paragraph = (s: string) => ({ type: 'paragraph', paragraph: { rich_text: rt(s) } });
const h = (kind: 'heading_1' | 'heading_2', s: string) => ({ type: kind, [kind]: { rich_text: rt(s) } });
const bulleted = (s: string) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(s) } });
const code = (lang: string, s: string) => ({ type: 'code', code: { language: lang, rich_text: rt(s) } });

function texts(rich: any[]): string {
  return rich.map(r => r.plain_text ?? r.text?.content ?? '').join('');
}
