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
  nbsp: ' ',
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

const extractRecipeJson = (html: string): string | null => {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const node = scripts
    .map((script) => {
      try {
        return findRecipeNode(JSON.parse(script[1]));
      } catch {
        return null;
      }
    })
    .find((found) => found !== null);
  if (!node) return null;

  // Keep the fields a recipe form reads and drop the rest (images, reviews, video).
  const { name, description, recipeYield, prepTime, cookTime, totalTime } =
    node as Record<string, unknown>;
  const kept = {
    name,
    description,
    recipeYield,
    prepTime,
    cookTime,
    totalTime,
    recipeIngredient: node.recipeIngredient,
    recipeInstructions: node.recipeInstructions,
  };
  return JSON.stringify(kept).slice(0, MAX_STRUCTURED_CHARS);
};

const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1]).trim() : null;
};

const extractVisibleText = (html: string): string => {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|form|iframe)\b[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(
      /<\/(p|div|li|ul|ol|h[1-6]|tr|section|article|br)>|<br\s*\/?>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_CHARS);
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

      return {
        url: finalUrl,
        title: extractTitle(html),
        structured: extractRecipeJson(html),
        text: extractVisibleText(html),
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
