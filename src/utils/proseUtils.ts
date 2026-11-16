const BULLET_RE = /^\s*[-*+•]\s+(.*)$/;
const NUMBER_RE = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const LIST_MARK_RE = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+/;
const QUOTE_RE = /^\s*(?:>\s*)+(.*)$/;
const INTRO_RE = /:[*_]{0,3}$/;
const DEFINITION_RE = /^\s*(?:(?:[-*+•]|\d{1,3}[.)])\s+)?\[[^\]]+\]:\s*\S/;
const RULE_RE = /^\s*([-*_]\s*){3,}$/;
const FENCE_RE = /^\s*(```|~~~)/;
const TABLE_RULE_RE = /^[\s|:-]+$/;
const URL_RE = /https?:\/\/(?:[^\s<>()[\]"']|\([^\s<>()[\]"']*\))+/g;
const LINK_DESTINATION_RE =
  /^\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+"[^"]*")?\s*\)/;
const INVISIBLE_RE =
  /\u034F|[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const CLAIM_RE =
  /(?<![\p{L}\p{N}-])(?:https?:\/\/)?(?:[\p{L}\p{N}][\p{L}\p{N}-]*[.\u3002])+\p{L}{2,24}(?![\p{L}\p{N}])/giu;
const KNOWN_TLDS = new Set(
  'com net org edu gov mil int info biz name pro app dev io ai co me tv xyz online site shop store tech cloud link live top club vip icu one page bank pay money email news blog life world today space fun cc ly gl gg is it us uk ca au nz de fr es nl eu jp cn in br ru ch se no fi dk be at ie mx za kr sg hk tw ar pt gr tr cz ro hu il ae cl pe'.split(
    ' ',
  ),
);
const FILE_EXTENSIONS = new Set(
  'js ts jsx tsx py md rb pl sh rs cs java json xml html htm css php pdf doc docx xls xlsx ppt pptx txt csv png jpg jpeg gif svg webp mp3 mp4 mov zip wav exe dmg pkg log yml yaml toml ini bak tmp'.split(
    ' ',
  ),
);
const LITERAL_STAR = '\u0001';

const hostOf = (address: string) => {
  try {
    return new URL(
      /^https?:\/\//i.test(address) ? address : `https://${address}`,
    ).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return null;
  }
};

/** A web address in one canonical form so two spellings of one address compare equal; null unless it is http or https. */
export function toLinkKey(address: string): string | null {
  try {
    const url = new URL(address.trim());
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const safeDecode = (value: string) => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};

/** The check a rendered link passes: its href as one canonical http(s) address when it may be drawn as a link, else null. With `allowed` given, the address must also be one of them. */
export function createLinkGate(
  allowed: ReadonlySet<string> | null | undefined,
): (href: string | undefined) => string | null {
  const keys = allowed
    ? new Set([...allowed].flatMap((link) => toLinkKey(link) ?? []))
    : null;
  return (href) => {
    if (!href) return null;
    const own = toLinkKey(href);
    if (own === null || keys === null) return own;
    if (keys.has(own)) return own;
    const decoded = toLinkKey(safeDecode(href));
    return decoded !== null && keys.has(decoded) ? decoded : null;
  };
}

type Claim = { host: string; isSure: boolean };

const claimsOf = (label: string): Claim[] =>
  (label.normalize('NFKC').match(CLAIM_RE) ?? []).flatMap((claim) => {
    const host = hostOf(claim);
    const tld = (claim.split(/[.\u3002]/).pop() ?? '').trim();
    const isShaped = tld === tld.toLowerCase() || tld === tld.toUpperCase();
    if (host === null || !isShaped || FILE_EXTENSIONS.has(tld.toLowerCase()))
      return [];
    return [
      {
        host,
        isSure:
          /^https?:\/\/|^www\./i.test(claim) ||
          KNOWN_TLDS.has(tld.toLowerCase()),
      },
    ];
  });

const isSameSite = (claimed: string, host: string) =>
  claimed === host || claimed.endsWith(`.${host}`);

/** The words a link shows: the model's own label, with invisible characters removed, unless it names a web address that isn't the link's own (then the link's host; a doubtful one gets the host beside it). */
export function labelForLink(rawLabel: string, href: string): string {
  const label = rawLabel.replace(INVISIBLE_RE, '').trim();
  const host = hostOf(href);
  if (host === null) return label;
  if (label === '') return host;
  const claims = claimsOf(label);
  const other = claims.filter((claim) => !isSameSite(claim.host, host));
  if (other.some((claim) => claim.isSure)) return host;
  const namesHost = claims.length > other.length;
  return other.length > 0 && !namesHost ? `${label} (${host})` : label;
}

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
  | { kind: 'quote'; text: string; isPlain: boolean }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbers'; items: string[]; start: number };

const cleanLine = (line: string) => {
  const heading = line.replace(/^\s*#{1,6}\s+/, '');
  if (
    RULE_RE.test(line) ||
    FENCE_RE.test(line) ||
    DEFINITION_RE.test(line) ||
    DEFINITION_RE.test(heading)
  )
    return null;
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

const readQuoteLine = (state: ReadState, inner: string): ReadState => {
  const cleaned = cleanLine(inner);
  if (cleaned === null) return { ...state, hasGap: true };
  const text = cleaned.replace(LIST_MARK_RE, '').trim();
  if (text === '') return state;
  const last = state.blocks[state.blocks.length - 1];
  if (last?.kind === 'quote' && !state.hasGap) {
    return {
      hasGap: false,
      blocks: withLast(state.blocks, { ...last, text: `${last.text} ${text}` }),
    };
  }
  return {
    hasGap: false,
    blocks: [
      ...state.blocks,
      {
        kind: 'quote',
        text,
        isPlain: state.blocks.some((block) => block.kind === 'quote'),
      },
    ],
  };
};

const readLine = (
  state: ReadState,
  raw: string,
  nextRaw: string | undefined,
): ReadState => {
  const quote = QUOTE_RE.exec(raw);
  if (quote) return readQuoteLine(state, quote[1]);
  const line = cleanLine(raw);
  if (line === null || line.trim() === '') return { ...state, hasGap: true };
  const last = state.blocks[state.blocks.length - 1];
  const bullet = BULLET_RE.exec(line);
  const number = bullet ? null : NUMBER_RE.exec(line);
  const nextLine = nextRaw === undefined ? null : cleanLine(nextRaw);
  const hasSecondItem =
    nextLine !== null && (bullet ? BULLET_RE : NUMBER_RE).test(nextLine);
  const opensList =
    !last ||
    state.hasGap ||
    last.kind !== 'paragraph' ||
    INTRO_RE.test(last.text) ||
    hasSecondItem;
  if (opensList && (bullet || number)) {
    const text = (bullet ? bullet[1] : (number?.[2] ?? '')).trim();
    if (bullet) {
      return {
        hasGap: false,
        blocks:
          last && last.kind === 'bullets'
            ? withLast(state.blocks, {
                ...last,
                items: [...last.items, text],
              })
            : [...state.blocks, { kind: 'bullets', items: [text] }],
      };
    }
    return {
      hasGap: false,
      blocks:
        last && last.kind === 'numbers'
          ? withLast(state.blocks, { ...last, items: [...last.items, text] })
          : [
              ...state.blocks,
              { kind: 'numbers', items: [text], start: Number(number?.[1]) },
            ],
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
  if (last.kind !== 'quote' && /^\s{2,}\S/.test(line)) {
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

const readBlocks = (text: string): Block[] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return lines.reduce<ReadState>(
    (state, raw, index) => readLine(state, raw, lines[index + 1]),
    { blocks: [], hasGap: false },
  ).blocks;
};

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

const openerIn = (text: string) =>
  text.split('').reduceRight<{ depth: number; at: number }>(
    (found, char, index) => {
      if (found.at >= 0 || text[index - 1] === '\\') return found;
      if (char === ']') return { ...found, depth: found.depth + 1 };
      if (char !== '[') return found;
      return found.depth === 0
        ? { depth: 0, at: index }
        : { ...found, depth: found.depth - 1 };
    },
    { depth: 0, at: -1 },
  ).at;

/** Replaces each inline link, whatever brackets its label holds, with what `rewrite` returns for its label (brackets removed) and address. */
const rewriteLinks = (
  text: string,
  rewrite: (label: string, url: string) => string,
  from = 0,
): string => {
  const close = text.indexOf('](', from);
  if (close < 0) return text;
  const opener = openerIn(text.slice(from, close));
  const destination = LINK_DESTINATION_RE.exec(text.slice(close + 1));
  if (opener < 0 || !destination) {
    return rewriteLinks(text, rewrite, close + 2);
  }
  const label = text.slice(from + opener + 1, close).replace(/[[\]]/g, '');
  const head = `${text.slice(0, from + opener)}${rewrite(label, destination[1])}`;
  return rewriteLinks(
    `${head}${text.slice(close + 1 + destination[0].length)}`,
    rewrite,
    head.length,
  );
};

const keepLink = (label: string, url: string, allowed: ReadonlySet<string>) => {
  const key = toLinkKey(url.replace(/[.,;:!?]+$/, ''));
  return url.startsWith('https://') && key !== null && allowed.has(key)
    ? `[${labelForLink(label, url)}](${url})`
    : label.replace(INVISIBLE_RE, '');
};

const readInline = (text: string, allowed: ReadonlySet<string>) =>
  balanceMarks(
    rewriteLinks(
      text
        .replace(/\\\*/g, LITERAL_STAR)
        .replace(/(\d)\*(?=\d)/g, `$1${LITERAL_STAR}`)
        .replace(/(^|\s)\*(?=\s|$)/g, `$1${LITERAL_STAR}`)
        .replace(/<(https?:\/\/[^\s>]+)>/g, '$1')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'),
      (label, url) => keepLink(label, url, allowed),
    )
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
      .replace(/\[([^\]\n]*)\]\([^)]*$/, '$1')
      .replace(/\[[^\]]*$/, (rest) => rest.slice(1))
      .replace(/`+/g, '')
      .replace(/~~/g, '')
      .replace(/__([^_]+)__/g, '**$1**')
      .replace(/\s+/g, ' ')
      .trim(),
  ).replace(new RegExp(LITERAL_STAR, 'g'), '\\*');

type QuoteStyle = 'mark' | 'curly' | 'plain';

const writeBlocks = (
  blocks: Block[],
  allowed: ReadonlySet<string>,
  quoteStyle: QuoteStyle = 'mark',
): string[] =>
  blocks.flatMap((block): string[] => {
    if (block.kind === 'paragraph') {
      const text = readInline(block.text, allowed);
      return text ? [text] : [];
    }
    if (block.kind === 'quote') {
      const text = readInline(block.text, allowed);
      if (!text) return [];
      if (quoteStyle === 'curly') return [`“${text}”`];
      return [quoteStyle === 'mark' && !block.isPlain ? `> ${text}` : text];
    }
    const items = block.items
      .map((item) => readInline(item, allowed))
      .filter(Boolean);
    return items.length === 0
      ? []
      : [
          items
            .map((item, index) =>
              block.kind === 'bullets'
                ? `- ${item}`
                : `${block.start + index}. ${item}`,
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

/** A written reply kept as light Markdown: paragraphs split on one blank line, `-` and `1.` lists, one `>` blockquote (nested marks flattened, any later one a plain paragraph), **bold**, *italic* and https links to an address in `allowedLinks` (any other link is reduced to its text, and a label that names a different web address becomes the link's host); headings, tables, images, code and raw HTML are dropped to plain words. Cut at `cap` characters at a word, with no mark left open; null when nothing is left. */
export function normalizeProse(
  value: unknown,
  cap: number,
  allowedLinks: readonly string[] = [],
): string | null {
  if (typeof value !== 'string') return null;
  const allowed = new Set(
    allowedLinks.flatMap((link) => toLinkKey(link) ?? []),
  );
  const written = writeProse(value, allowed);
  const cut = writeProse(cutAtBreak(written, cap), allowed);
  return cut || null;
}

const stripInline = (text: string, isSpoken: boolean) =>
  text
    .replace(/\\\*/g, LITERAL_STAR)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '$1')
    .replace(/\*+/g, '')
    .replace(/(^|[^\w])_+([^_]+)_+(?=[^\w]|$)/g, '$1$2')
    .replace(
      new RegExp(`(\\d)\\s*${LITERAL_STAR}\\s*(?=\\d)`, 'g'),
      (whole, digit: string) => (isSpoken ? `${digit} times ` : whole),
    )
    .replace(new RegExp(LITERAL_STAR, 'g'), isSpoken ? '' : '*');

const asSentence = (text: string) =>
  /[.!?…:;]$/.test(text) ? text : `${text}.`;

/** `text` with Markdown marks removed. By default one plain line for the ear (list items become sentences, web addresses are left out); with `keepBreaks`, paragraphs stay split by a blank line and list items stay on their own lines. */
export function stripProseMarks(
  text: string,
  { keepBreaks = false }: { keepBreaks?: boolean } = {},
): string {
  const blocks = writeBlocks(
    readBlocks(text),
    new Set<string>(),
    keepBreaks ? 'curly' : 'plain',
  ).map((block) => stripInline(block, !keepBreaks));
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
