import { extractLinks, normalizeProse } from '@/utils/proseUtils';

const MAX_REMEMBERED = 60;
const remembered = new Map<string, string>();

/** A stored written answer made safe to draw as Markdown: structure kept, only https links already in the text stay, a label naming another site shows the host. */
export function readWrittenAnswer(text: string): string {
  const kept = remembered.get(text);
  if (kept !== undefined) return kept;
  const links = extractLinks([text]).filter((link) =>
    link.startsWith('https://'),
  );
  const safe = normalizeProse(text, text.length, links) ?? '';
  if (remembered.size >= MAX_REMEMBERED) {
    remembered.delete(remembered.keys().next().value as string);
  }
  remembered.set(text, safe);
  return safe;
}
