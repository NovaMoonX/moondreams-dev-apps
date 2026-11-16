// Generated from src/utils/proseUtils.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
const BULLET_RE = /^\s*[-*+•]\s+(.*)$/;
const NUMBER_RE = /^\s*\d{1,3}[.)]\s+(.*)$/;
const RULE_RE = /^\s*([-*_]\s*){3,}$/;
const FENCE_RE = /^\s*(```|~~~)/;
const TABLE_RULE_RE = /^[\s|:-]+$/;
const URL_RE = /https?:\/\/[^\s<>()[\]"']+/g;
const LINK_RE = /\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g;

/** Every web address written out in `texts`, as written (trailing punctuation left off). */
export function extractLinks(texts: readonly string[]): string[] {
  return [
    ...new Set(
      texts.flatMap((text) =>
        (text.match(URL_RE) ?? []).map((url) => url.replace(/[.,;:!?]+$/, '')),
      ),
    ),
  ];
}

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets' | 'numbers'; items: string[] };

const cleanLine = (line: string) => {
  if (RULE_RE.test(line) || FENCE_RE.test(line)) return null;
  const heading = line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*>+\s?/, '');
  if (/^\s*\|.*\|\s*$/.test(heading)) {
    return TABLE_RULE_RE.test(heading)
      ? null
      : heading
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((cell) => cell.trim())
          .join(', ');
  }
  return heading;
};

interface ReadState {
  blocks: Block[];
  hasGap: boolean;
}

const withLast = (blocks: Block[], block: Block): Block[] => [
  ...blocks.slice(0, -1),
  block,
];

const readLine = (state: ReadState, raw: string): ReadState => {
  const line = cleanLine(raw);
  if (line === null || line.trim() === '') return { ...state, hasGap: true };
  const last = state.blocks[state.blocks.length - 1];
  const bullet = BULLET_RE.exec(line);
  const number = bullet ? null : NUMBER_RE.exec(line);
  const item = bullet ?? number;
  if (item) {
    const kind = bullet ? 'bullets' : 'numbers';
    const text = item[1].trim();
    return {
      hasGap: false,
      blocks:
        last && last.kind === kind
          ? withLast(state.blocks, { kind, items: [...last.items, text] })
          : [...state.blocks, { kind, items: [text] }],
    };
  }
  const text = line.trim();
  if (/^\s*(#{1,6}\s|\|)/.test(raw)) {
    return {
      hasGap: true,
      blocks: [...state.blocks, { kind: 'paragraph', text }],
    };
  }
  if (!last || state.hasGap) {
    return {
      hasGap: false,
      blocks: [...state.blocks, { kind: 'paragraph', text }],
    };
  }
  if (last.kind === 'paragraph') {
    return {
      hasGap: false,
      blocks: withLast(state.blocks, {
        kind: 'paragraph',
        text: `${last.text} ${text}`,
      }),
    };
  }
  if (/^\s{2,}\S/.test(line)) {
    const items = [
      ...last.items.slice(0, -1),
      `${last.items[last.items.length - 1]} ${text}`,
    ];
    return {
      hasGap: false,
      blocks: withLast(state.blocks, { ...last, items }),
    };
  }
  return {
    hasGap: false,
    blocks: [...state.blocks, { kind: 'paragraph', text }],
  };
};

const readBlocks = (text: string): Block[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .reduce<ReadState>(readLine, { blocks: [], hasGap: false }).blocks;

const lastIndexOfSingle = (text: string) =>
  Array.from(text).reduce(
    (found, char, index) =>
      char === '*' && text[index - 1] !== '*' && text[index + 1] !== '*'
        ? index
        : found,
    -1,
  );

/** Drops an emphasis mark that never closes, so a cut or a stray asterisk never shows as a mark on screen. */
const balanceMarks = (text: string) => {
  const strongCount = text.split('**').length - 1;
  const strongLast = text.lastIndexOf('**');
  const afterStrong =
    strongCount % 2 === 1
      ? `${text.slice(0, strongLast)}${text.slice(strongLast + 2)}`
      : text;
  const singleCount = afterStrong.replace(/\*\*/g, '').split('*').length - 1;
  const singleLast = lastIndexOfSingle(afterStrong);
  return singleCount % 2 === 1 && singleLast >= 0
    ? `${afterStrong.slice(0, singleLast)}${afterStrong.slice(singleLast + 1)}`
    : afterStrong;
};

const readInline = (text: string, allowed: ReadonlySet<string>) =>
  balanceMarks(
    text
      .replace(/<(https?:\/\/[^\s>]+)>/g, '$1')
      .replace(/<\/?[a-z][^>]*>/gi, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(LINK_RE, (_, label: string, url: string) =>
        allowed.has(url.replace(/[.,;:!?]+$/, ''))
          ? `[${label}](${url})`
          : label,
      )
      .replace(/\[([^\]\n]*)\]\([^)]*$/, '$1')
      .replace(/\[[^\]]*$/, (rest) => rest.slice(1))
      .replace(/`+/g, '')
      .replace(/~~/g, '')
      .replace(/__([^_]+)__/g, '**$1**')
      .replace(/\s+/g, ' ')
      .trim(),
  );

const writeBlocks = (blocks: Block[], allowed: ReadonlySet<string>): string[] =>
  blocks.flatMap((block): string[] => {
    if (block.kind === 'paragraph') {
      const text = readInline(block.text, allowed);
      return text ? [text] : [];
    }
    const items = block.items
      .map((item) => readInline(item, allowed))
      .filter(Boolean);
    return items.length === 0
      ? []
      : [
          items
            .map((item, index) =>
              block.kind === 'bullets' ? `- ${item}` : `${index + 1}. ${item}`,
            )
            .join('\n'),
        ];
  });

const cutAtBreak = (text: string, cap: number) => {
  if (text.length <= cap) return text;
  const cut = text.slice(0, cap);
  const space = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return (space > cap / 2 ? cut.slice(0, space) : cut).trim();
};

const writeProse = (value: string, allowed: ReadonlySet<string>) =>
  writeBlocks(readBlocks(value), allowed).join('\n\n');

/** A written reply kept as light Markdown: paragraphs split on one blank line, `-` and `1.` lists, **bold**, *italic* and links to a web address in `allowedLinks` (any other link is reduced to its text); headings, tables, images, code and raw HTML are dropped to plain words. Cut at `cap` characters at a word, with no mark left open; null when nothing is left. */
export function normalizeProse(
  value: unknown,
  cap: number,
  allowedLinks: readonly string[] = [],
): string | null {
  if (typeof value !== 'string') return null;
  const allowed = new Set(allowedLinks);
  const written = writeProse(value, allowed);
  const cut = writeProse(cutAtBreak(written, cap), allowed);
  return cut || null;
}

const stripInline = (text: string) =>
  text.replace(/\*+/g, '').replace(/(^|[^\w])_+([^_]+)_+(?=[^\w]|$)/g, '$1$2');

const asSentence = (text: string) =>
  /[.!?…:;]$/.test(text) ? text : `${text}.`;

/** `text` with Markdown marks removed. By default one plain line for the ear (list items become sentences, web addresses are left out); with `keepBreaks`, paragraphs stay split by a blank line and list items stay on their own lines. */
export function stripProseMarks(
  text: string,
  { keepBreaks = false }: { keepBreaks?: boolean } = {},
): string {
  const blocks = writeBlocks(readBlocks(text), new Set<string>()).map(
    stripInline,
  );
  if (keepBreaks) return blocks.join('\n\n');
  return blocks
    .flatMap((block) =>
      block.split('\n').map((line) => {
        const isItem = /^(?:-|\d+\.)\s+/.test(line);
        const plain = line
          .replace(/^(?:-|\d+\.)\s+/, '')
          .replace(URL_RE, '')
          .replace(/\s+/g, ' ')
          .trim();
        return isItem && plain ? asSentence(plain) : plain;
      }),
    )
    .filter(Boolean)
    .join(' ');
}

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'inc',
  'ltd',
  'co',
  'no',
  'approx',
  'dept',
  'est',
  'fig',
  'gen',
  'gov',
  'lt',
  'mt',
  'rev',
  'sgt',
  'ave',
  'blvd',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
]);

const isSentenceEnd = (before: string, punctuation: string, after: string) => {
  if (punctuation.length > 1 && punctuation.startsWith('.')) return false;
  if (/^["'“‘([]*[a-z]/.test(after)) return false;
  if (punctuation !== '.') return true;
  const word = (/(\S+)$/.exec(before)?.[1] ?? '')
    .replace(/^["'“‘([]+/, '')
    .toLowerCase();
  return !(
    ABBREVIATIONS.has(word) ||
    /^[a-z]$/.test(word) ||
    /^([a-z]\.)+[a-z]$/.test(word)
  );
};

const splitSentences = (text: string) => {
  const ends = Array.from(
    text.matchAll(/([.!?]+)(["'”’)\]]*)(\s+)(?=\S)/g),
  ).filter((match) =>
    isSentenceEnd(
      text.slice(0, match.index),
      match[1],
      text.slice(match.index + match[0].length),
    ),
  );
  return ends
    .map((match, index) => {
      const start =
        index === 0 ? 0 : ends[index - 1].index + ends[index - 1][0].length;
      return text.slice(start, match.index + match[1].length + match[2].length);
    })
    .concat(
      text.slice(
        ends.length === 0
          ? 0
          : ends[ends.length - 1].index + ends[ends.length - 1][0].length,
      ),
    )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

/** Plain `text` as short paragraphs for large type: about two sentences each, one when a sentence runs past `longSentence` characters. Breaks only at a sentence end (never after Dr., e.g., an initial, a decimal, a time or an ellipsis); text already split by blank lines keeps its paragraphs. */
export function splitIntoParagraphs(
  text: string,
  { sentencesPerParagraph = 2, longSentence = 120 } = {},
): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .flatMap((part) =>
      splitSentences(part)
        .reduce<string[][]>((groups, sentence) => {
          const group = groups[groups.length - 1];
          const isFull =
            !group ||
            group.length >= sentencesPerParagraph ||
            sentence.length > longSentence ||
            group[group.length - 1].length > longSentence;
          return isFull
            ? [...groups, [sentence]]
            : [...groups.slice(0, -1), [...group, sentence]];
        }, [])
        .map((group) => group.join(' ')),
    );
}
