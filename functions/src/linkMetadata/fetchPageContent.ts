import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { fetchPublicPage, MAX_URL_LENGTH } from './safeFetch.js';

/** Reads one web page a signed-in person pasted and returns only the kinds of content the caller asks for, so any app can hand a page to its own reader. */

const MAX_BODY_BYTES = 1536 * 1024;
const DEFAULT_TEXT_CHARS = 30000;
const MIN_TEXT_CHARS = 1000;
const MAX_TEXT_CHARS = 60000;
const MAX_STRUCTURED_CHARS = 30000;
const MAX_HEADINGS = 40;
const MAX_IMAGES = 20;
const MAX_IMAGE_SOURCES = 100;
const MAX_TAG_CHARS = 2000;
const MAX_SCHEMA_TYPES = 10;

export const CONTENT_KINDS = [
  'text',
  'structuredData',
  'meta',
  'headings',
  'images',
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

const DEFAULT_KINDS: ContentKind[] = ['text', 'meta'];

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

const decodeEntities = (value: string) =>
  value.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });

const typesOf = (node: Record<string, unknown>): string[] => {
  const type = node['@type'];
  if (typeof type === 'string') return [type];
  return Array.isArray(type)
    ? type.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

const flattenNodes = (value: unknown, depth = 0): Record<string, unknown>[] => {
  if (depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenNodes(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') return [];
  const node = value as Record<string, unknown>;
  return node['@graph'] ? flattenNodes(node['@graph'], depth + 1) : [node];
};

/** A node larger than the cap keeps its smaller fields (an article without its embedded comments) instead of vanishing. */
const fitNode = (
  node: Record<string, unknown>,
): Record<string, unknown> | null => {
  if (JSON.stringify(node).length <= MAX_STRUCTURED_CHARS) return node;
  const droppable = Object.entries(node).filter(
    ([key]) => !key.startsWith('@'),
  );
  if (droppable.length === 0) return null;
  const largest = droppable.reduce((biggest, entry) =>
    JSON.stringify(entry[1]).length > JSON.stringify(biggest[1]).length
      ? entry
      : biggest,
  );
  return fitNode(
    Object.fromEntries(
      Object.entries(node).filter(([key]) => key !== largest[0]),
    ),
  );
};

const pickStructuredData = (blocks: string[], schemaTypes: string[]) => {
  const nodes = blocks
    .flatMap((block) => {
      try {
        return flattenNodes(JSON.parse(block));
      } catch {
        return [];
      }
    })
    .filter(
      (node) =>
        schemaTypes.length === 0 ||
        typesOf(node).some((type) => schemaTypes.includes(type)),
    )
    .map((node) =>
      Object.fromEntries(
        Object.entries(node).filter(([key]) => key !== '@context'),
      ),
    );

  return nodes
    .map(fitNode)
    .filter((node): node is Record<string, unknown> => node !== null)
    .reduce<{ kept: Record<string, unknown>[]; size: number }>(
      (acc, node) => {
        const size = acc.size + JSON.stringify(node).length;
        return size > MAX_STRUCTURED_CHARS
          ? acc
          : { kept: [...acc.kept, node], size };
      },
      { kept: [], size: 0 },
    ).kept;
};

const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'nav',
  'footer',
  'form',
  'iframe',
  'title',
]);
const BREAKING_TAGS = new Set([
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
  'section',
  'article',
  'br',
  'aside',
  'main',
  'blockquote',
  'dl',
  'dd',
  'dt',
  'figure',
  'figcaption',
  'table',
  'td',
  'th',
  'pre',
  'header',
]);
const MAX_SCANNED_TEXT_CHARS = 200000;

const findClosing = (html: string, name: string, from: number) => {
  for (
    let at = html.indexOf('</', from);
    at !== -1;
    at = html.indexOf('</', at + 2)
  ) {
    if (html.slice(at + 2, at + 2 + name.length).toLowerCase() === name) {
      return at;
    }
  }
  return html.length;
};

interface PageMeta {
  description: string | null;
  image: string | null;
  siteName: string | null;
  author: string | null;
}

interface PageParts {
  title: string | null;
  text: string;
  jsonBlocks: string[];
  meta: PageMeta;
  headings: string[];
  imageSources: string[];
}

const ATTRIBUTE =
  /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/y;

const parseAttributes = (tag: string, from: number): Record<string, string> => {
  const attributes: Record<string, string> = {};
  let position = from;
  while (position < tag.length) {
    ATTRIBUTE.lastIndex = position;
    const match = ATTRIBUTE.exec(tag);
    if (!match) {
      position += 1;
      continue;
    }
    attributes[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
    position = ATTRIBUTE.lastIndex;
  }
  return attributes;
};

const HEADING_TAGS = new Set(['h1', 'h2', 'h3']);

const toMeta = (tags: Record<string, string>[]): PageMeta => {
  const content = (...keys: string[]) =>
    tags
      .find((tag) =>
        keys.includes((tag.property ?? tag.name ?? '').toLowerCase()),
      )
      ?.content?.trim() || null;
  return {
    description: content('og:description', 'description'),
    image: content('og:image', 'twitter:image'),
    siteName: content('og:site_name'),
    author: content('author'),
  };
};

/**
 * One left-to-right pass over the page, so a hostile page can't make it slow: every step moves forward
 * with `indexOf` or a sticky pattern that starts on a token, and each tag is read once and capped.
 */
const readPage = (html: string): PageParts => {
  const chunks: string[] = [];
  const blocks: string[] = [];
  const metaTags: Record<string, string>[] = [];
  const headings: string[] = [];
  const imageSources: string[] = [];
  let title: string | null = null;
  let headingFrom: number | null = null;
  let length = 0;
  let at = 0;

  while (at < html.length && length < MAX_SCANNED_TEXT_CHARS) {
    const open = html.indexOf('<', at);
    const textEnd = open === -1 ? html.length : open;
    if (textEnd > at) {
      const text = html.slice(at, textEnd);
      chunks.push(text);
      length += text.length;
    }
    if (open === -1) break;

    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      at = end === -1 ? html.length : end + 3;
      continue;
    }

    const close = html.indexOf('>', open + 1);
    if (close === -1) break;

    const tag = html.slice(open + 1, Math.min(close, open + 1 + MAX_TAG_CHARS));
    const name = /^\/?([a-z][a-z0-9]*)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const isClosing = tag.startsWith('/');
    at = close + 1;

    if (!isClosing && SKIPPED_TAGS.has(name)) {
      const bodyEnd = findClosing(html, name, at);
      const body = html.slice(at, bodyEnd);
      if (name === 'title' && title === null) {
        title = decodeEntities(body).trim() || null;
      }
      if (
        name === 'script' &&
        /application\/ld\+json/i.test(tag.slice(0, 300))
      ) {
        blocks.push(body);
      }
      const end = html.indexOf('>', bodyEnd);
      at = end === -1 ? html.length : end + 1;
      continue;
    }

    if (!isClosing && name === 'meta') {
      metaTags.push(parseAttributes(tag, name.length + 1));
    }
    if (!isClosing && name === 'img') {
      const { src, 'data-src': lazySrc } = parseAttributes(
        tag,
        name.length + 1,
      );
      const source = src || lazySrc;
      if (source && imageSources.length < MAX_IMAGE_SOURCES)
        imageSources.push(source);
    }
    if (HEADING_TAGS.has(name)) {
      if (!isClosing) {
        headingFrom = chunks.length;
      } else if (headingFrom !== null) {
        const heading = decodeEntities(chunks.slice(headingFrom).join(' '))
          .replace(/\s+/g, ' ')
          .trim();
        if (heading && headings.length < MAX_HEADINGS) headings.push(heading);
        headingFrom = null;
      }
    }

    chunks.push(BREAKING_TAGS.has(name) ? '\n' : isClosing ? '' : ' ');
  }

  const text = decodeEntities(chunks.join(''))
    .split('\n')
    .map((line) => line.replace(/[ \t\xa0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  return {
    title,
    text,
    jsonBlocks: blocks,
    meta: toMeta(metaTags),
    headings,
    imageSources,
  };
};

const toImageUrls = (sources: string[], base: string, first: string | null) => {
  const hrefs = [first, ...sources].flatMap((source) => {
    if (!source) return [];
    try {
      const url = new URL(source, base);
      return ['http:', 'https:'].includes(url.protocol) &&
        url.href.length <= MAX_URL_LENGTH
        ? [url.href]
        : [];
    } catch {
      return [];
    }
  });
  const result = [...new Set(hrefs)].slice(0, MAX_IMAGES);
  return result;
};

const readKinds = (value: unknown): ContentKind[] | null => {
  if (value === undefined) return DEFAULT_KINDS;
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((kind) => CONTENT_KINDS.includes(kind as ContentKind))
    ? (value as ContentKind[])
    : null;
};

const readSchemaTypes = (value: unknown): string[] | null => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > MAX_SCHEMA_TYPES ||
    !value.every(
      (type) =>
        typeof type === 'string' && type.length > 0 && type.length <= 60,
    )
  ) {
    return null;
  }
  return value as string[];
};

const readTextLimit = (value: unknown): number | null => {
  if (value === undefined) return DEFAULT_TEXT_CHARS;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_TEXT_CHARS, Math.max(MIN_TEXT_CHARS, Math.floor(value)))
    : null;
};

export const fetchPageContent = onCall(
  {
    region: 'us-central1',
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to read a link.',
      );
    }

    const rawUrl =
      typeof request.data?.url === 'string' ? request.data.url.trim() : '';
    if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
      throw new HttpsError('invalid-argument', 'Provide a valid link.');
    }
    try {
      const parsed = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('protocol');
      }
    } catch {
      throw new HttpsError('invalid-argument', 'Provide a valid web link.');
    }

    const kinds = readKinds(request.data?.include);
    const schemaTypes = readSchemaTypes(request.data?.schemaTypes);
    const textLimit = readTextLimit(request.data?.maxTextChars);
    if (!kinds || !schemaTypes || textLimit === null) {
      throw new HttpsError(
        'invalid-argument',
        'Ask for a supported kind of content.',
      );
    }

    try {
      const { html, finalUrl } = await fetchPublicPage(rawUrl, {
        maxBytes: MAX_BODY_BYTES,
        stopAtHead: false,
      });
      if (!html) {
        throw new HttpsError(
          'failed-precondition',
          "That link isn't a web page we can read.",
        );
      }

      const page = readPage(html);
      const has = (kind: ContentKind) => kinds.includes(kind);

      return {
        url: finalUrl,
        title: page.title,
        ...(has('text') && { text: page.text.slice(0, textLimit) }),
        ...(has('structuredData') && {
          structuredData: pickStructuredData(page.jsonBlocks, schemaTypes),
        }),
        ...(has('meta') && {
          meta: {
            ...page.meta,
            image: toImageUrls([], finalUrl, page.meta.image)[0] ?? null,
          },
        }),
        ...(has('headings') && { headings: page.headings }),
        ...(has('images') && {
          images: toImageUrls(page.imageSources, finalUrl, page.meta.image),
        }),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('unavailable', "Couldn't load that link.");
    }
  },
);

export default fetchPageContent;
