// Round-trip limited subset: h1, h2, paragraph, - list, fenced code.
export type Block = Record<string, any>;

export function mdToBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    if (ln.startsWith('# ')) {
      out.push(h('heading_1', parseInlineMarkdown(ln.slice(2).trim()))); continue;
    }
    if (ln.startsWith('## ')) {
      out.push(h('heading_2', parseInlineMarkdown(ln.slice(3).trim()))); continue;
    }
    if (ln.startsWith('### ')) {
      out.push(h('heading_3', parseInlineMarkdown(ln.slice(4).trim()))); continue;
    }
    if (ln.startsWith('- ')) {
      out.push(bulleted(parseInlineMarkdown(ln.slice(2).trim()))); continue;
    }
    if (ln.startsWith('```')) {
      const lang = ln.slice(3).trim() || 'plain text';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      const content = buf.join('\n');
      
      // Split large code blocks to respect Notion's 2000 char limit
      if (content.length > 2000) {
        const chunks = [];
        for (let start = 0; start < content.length; start += 2000) {
          chunks.push(content.slice(start, start + 2000));
        }
        chunks.forEach((chunk) => {
          out.push(code(lang, chunk));
        });
      } else {
        out.push(code(lang, content));
      }
      continue;
    }
    if (ln.trim().length > 0) {
      out.push(paragraph(parseInlineMarkdown(ln.trim())));
    }
  }
  return out;
}

export function blocksToMd(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    const t = b.type;
    if (t === 'heading_1') out.push('# ' + richTextToMarkdown(b[t].rich_text));
    else if (t === 'heading_2') out.push('## ' + richTextToMarkdown(b[t].rich_text));
    else if (t === 'heading_3') out.push('### ' + richTextToMarkdown(b[t].rich_text));
    else if (t === 'bulleted_list_item') out.push('- ' + richTextToMarkdown(b[t].rich_text));
    else if (t === 'code') {
      const lang = b[t].language || '';
      out.push('```' + lang);
      out.push(texts(b[t].rich_text));
      out.push('```');
    } else if (t === 'paragraph') out.push(richTextToMarkdown(b[t].rich_text));
  }
  return out.join('\n').trim() + '\n';
}

const txt = (s: string) => ({ type: 'text', text: { content: s } });
const rt = (s: string) => [{ type: 'text', text: { content: s } }];

const paragraph = (richText: any[]) => ({ type: 'paragraph', paragraph: { rich_text: richText } });
const h = (kind: 'heading_1' | 'heading_2' | 'heading_3', richText: any[]) => ({ type: kind, [kind]: { rich_text: richText } });
const bulleted = (richText: any[]) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } });
const code = (lang: string, s: string) => ({ type: 'code', code: { language: lang, rich_text: rt(s) } });

function texts(rich: any[]): string {
  return rich.map(r => r.plain_text ?? r.text?.content ?? '').join('');
}

function parseInlineMarkdown(text: string): any[] {
  const richText: any[] = [];
  let currentPos = 0;
  
  // Regex patterns for markdown formatting
  const patterns = [
    { regex: /\*\*([^*]+?)\*\*/g, format: 'bold' },
    { regex: /\*([^*]+?)\*/g, format: 'italic' },
    { regex: /`([^`]+?)`/g, format: 'code' },
    { regex: /\[([^\]]+?)\]\(([^)]+?)\)/g, format: 'link' }
  ];
  
  // Find all matches and their positions
  const matches: { start: number; end: number; text: string; format: string; url?: string }[] = [];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      if (pattern.format === 'link') {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[1],
          format: pattern.format,
          url: match[2]
        });
      } else {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[1],
          format: pattern.format
        });
      }
    }
  }
  
  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);
  
  // Remove overlapping matches (keep the first one)
  const nonOverlapping: { start: number; end: number; text: string; format: string; url?: string }[] = [];
  for (const match of matches) {
    if (!nonOverlapping.some(existing => 
      (match.start >= existing.start && match.start < existing.end) ||
      (match.end > existing.start && match.end <= existing.end) ||
      (match.start <= existing.start && match.end >= existing.end)
    )) {
      nonOverlapping.push(match);
    }
  }
  
  // Build rich text array
  let pos = 0;
  for (const match of nonOverlapping) {
    // Add plain text before this match
    if (pos < match.start) {
      const plainText = text.slice(pos, match.start);
      if (plainText) {
        richText.push({ type: 'text', text: { content: plainText } });
      }
    }
    
    // Add formatted text
    const textObj: any = { type: 'text', text: { content: match.text } };
    
    if (match.format === 'bold') {
      textObj.annotations = { bold: true };
    } else if (match.format === 'italic') {
      textObj.annotations = { italic: true };
    } else if (match.format === 'code') {
      textObj.annotations = { code: true };
    } else if (match.format === 'link' && match.url) {
      textObj.text.link = { url: match.url };
    }
    
    richText.push(textObj);
    pos = match.end;
  }
  
  // Add remaining plain text
  if (pos < text.length) {
    const plainText = text.slice(pos);
    if (plainText) {
      richText.push({ type: 'text', text: { content: plainText } });
    }
  }
  
  // If no formatting found, return plain text
  if (richText.length === 0) {
    richText.push({ type: 'text', text: { content: text } });
  }
  
  return richText;
}

function richTextToMarkdown(richText: any[]): string {
  return richText.map(rt => {
    const content = rt.text?.content || rt.plain_text || '';
    const annotations = rt.annotations || {};
    const link = rt.text?.link?.url;
    
    let result = content;
    
    if (annotations.code) {
      result = `\`${result}\``;
    }
    if (annotations.bold) {
      result = `**${result}**`;
    }
    if (annotations.italic) {
      result = `*${result}*`;
    }
    if (link) {
      result = `[${result}](${link})`;
    }
    
    return result;
  }).join('');
}
