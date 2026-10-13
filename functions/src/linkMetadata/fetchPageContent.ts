import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { fetchPublicPage, MAX_URL_LENGTH } from './safeFetch.js';

/**
 * Reads the text of one web page a signed-in person pasted, so a client can have it read into a form
 * (a recipe). It returns the page's schema.org Recipe data when it has one, plus the page's visible text,
 * both capped. Nothing is stored, and it never runs on a schedule.
 */

const MAX_BODY_BYTES = 1536 * 1024;
const MAX_TEXT_CHARS = 30000;
const MAX_STRUCTURED_CHARS = 20000;

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

const isRecipeNode = (node: unknown): node is Record<string, unknown> => {
  if (!node || typeof node !== 'object') return false;
  const type = (node as Record<string, unknown>)['@type'];
  return Array.isArray(type) ? type.includes('Recipe') : type === 'Recipe';
};

const findRecipeNode = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    return value.map(findRecipeNode).find((node) => node !== null) ?? null;
  }
  if (isRecipeNode(value)) return value;
  if (value && typeof value === 'object') {
    const graph = (value as Record<string, unknown>)['@graph'];
    return graph ? findRecipeNode(graph) : null;
  }
  return null;
};

const toStructured = (node: Record<string, unknown>) =>
  JSON.stringify({
    name: node.name,
    description: node.description,
    recipeYield: node.recipeYield,
    prepTime: node.prepTime,
    cookTime: node.cookTime,
    totalTime: node.totalTime,
    recipeIngredient: node.recipeIngredient,
    recipeInstructions: node.recipeInstructions,
  }).slice(0, MAX_STRUCTURED_CHARS);

const parseRecipeJson = (blocks: string[]): string | null => {
  const node = blocks
    .map((block) => {
      try {
        return findRecipeNode(JSON.parse(block));
      } catch {
        return null;
      }
    })
    .find((found) => found !== null);
  return node ? toStructured(node) : null;
};

const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'nav',
  'header',
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
]);
const MAX_SCANNED_TEXT_CHARS = 200000;

/** Where a skipped tag's body ends: the next `</name` (any case) at or after `from`, or the end of the page. */
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

interface PageParts {
  title: string | null;
  recipeJson: string | null;
  text: string;
}

/**
 * One left-to-right pass over the page, so a hostile page can't make it slow: every step moves forward
 * with `indexOf`, and no pattern has to be retried from each position.
 */
const readPage = (html: string): PageParts => {
  const chunks: string[] = [];
  const blocks: string[] = [];
  let title: string | null = null;
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

    const tag = html.slice(open + 1, Math.min(close, open + 301));
    const name = /^\/?([a-z][a-z0-9]*)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const isClosing = tag.startsWith('/');
    at = close + 1;

    if (!isClosing && SKIPPED_TAGS.has(name)) {
      const bodyEnd = findClosing(html, name, at);
      const body = html.slice(at, bodyEnd);
      if (name === 'title' && title === null) {
        title = decodeEntities(body).trim() || null;
      }
      if (name === 'script' && /application\/ld\+json/i.test(tag)) {
        blocks.push(body);
      }
      const end = html.indexOf('>', bodyEnd);
      at = end === -1 ? html.length : end + 1;
      continue;
    }

    chunks.push(isClosing || BREAKING_TAGS.has(name) ? '\n' : ' ');
  }

  const text = decodeEntities(chunks.join(''))
    .split('\n')
    .map((line) => line.replace(/[ \t\xa0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_CHARS);

  return { title, recipeJson: parseRecipeJson(blocks), text };
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

      const { title, recipeJson, text } = readPage(html);

      return { url: finalUrl, title, structured: recipeJson, text };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('unavailable', "Couldn't load that link.");
    }
  },
);

export default fetchPageContent;
