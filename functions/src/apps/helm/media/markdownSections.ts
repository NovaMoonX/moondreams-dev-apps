import {
  MAX_HEADING_CHARS,
  MAX_SECTION_CHARS,
  MAX_SECTIONS,
} from '../topicWrite.js';

export interface MarkdownSection {
  heading: string | null;
  level: 1 | 2 | 3;
  markdown: string;
}

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

interface Block {
  heading: string | null;
  level: 1 | 2 | 3;
  lines: string[];
}

const splitLong = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .flatMap((paragraph) =>
      paragraph.length <= MAX_SECTION_CHARS
        ? [paragraph]
        : Array.from(
            { length: Math.ceil(paragraph.length / MAX_SECTION_CHARS) },
            (_, index) =>
              paragraph.slice(
                index * MAX_SECTION_CHARS,
                (index + 1) * MAX_SECTION_CHARS,
              ),
          ),
    )
    .reduce<string[]>((parts, paragraph) => {
      const last = parts.at(-1);
      return last !== undefined &&
        last.length + 2 + paragraph.length <= MAX_SECTION_CHARS
        ? [...parts.slice(0, -1), `${last}\n\n${paragraph}`]
        : [...parts, paragraph];
    }, []);

/** Splits a Markdown file at `#`, `##` and `###` headings outside code fences; text before the first heading is a section with no heading, and a part over the section cap carries on in sections with no heading. */
export function splitMarkdownSections(text: string): MarkdownSection[] {
  const state = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .reduce<{ blocks: Block[]; isFenced: boolean }>(
      (acc, line) => {
        const isFence = FENCE.test(line);
        const heading = acc.isFenced || isFence ? null : HEADING.exec(line);
        const isFenced = isFence ? !acc.isFenced : acc.isFenced;
        if (heading) {
          return {
            isFenced,
            blocks: [
              ...acc.blocks,
              {
                heading: heading[2].slice(0, MAX_HEADING_CHARS),
                level: heading[1].length as 1 | 2 | 3,
                lines: [],
              },
            ],
          };
        }
        const current = acc.blocks.at(-1) ?? {
          heading: null,
          level: 1 as const,
          lines: [],
        };
        return {
          isFenced,
          blocks: [
            ...acc.blocks.slice(0, -1),
            { ...current, lines: [...current.lines, line] },
          ],
        };
      },
      { blocks: [], isFenced: false },
    );
  return state.blocks.flatMap((block): MarkdownSection[] => {
    const body = block.lines.join('\n').trim();
    if (block.heading === null && body === '') return [];
    const [first = '', ...rest] =
      body.length > MAX_SECTION_CHARS ? splitLong(body) : [body];
    return [
      { heading: block.heading, level: block.level, markdown: first },
      ...rest.map((markdown): MarkdownSection => ({
        heading: null,
        level: block.level,
        markdown,
      })),
    ];
  });
}

/** The sections that hold words, plus an empty `##` or `###` heading that groups a deeper section with words after it; an empty `#` is the file's title and is not a section. */
export const readableSections = (text: string): MarkdownSection[] =>
  splitMarkdownSections(text).filter((section, index, all) => {
    if (section.markdown !== '') return true;
    if (section.level === 1) return false;
    const after = all.slice(index + 1);
    const end = after.findIndex((next) => next.level <= section.level);
    return (end === -1 ? after : after.slice(0, end)).some(
      (next) => next.markdown !== '',
    );
  });

/** Whether a file's sections fit a topic's section cap. */
export const fitsTopic = (sections: MarkdownSection[]) =>
  sections.length > 0 && sections.length <= MAX_SECTIONS;

const TITLE_CAP = 80;

/** The first `# ` heading, else the file's name without `.md`. */
export const markdownTitle = (text: string, fileName: string | null) => {
  const first = splitMarkdownSections(text).find(
    (section) => section.heading !== null && section.level === 1,
  );
  const named = (fileName ?? '').replace(/\.(md|markdown)$/i, '').trim();
  return (first?.heading ?? named ?? '').slice(0, TITLE_CAP) || 'Markdown file';
};
