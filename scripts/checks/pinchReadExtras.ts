import assert from 'node:assert/strict';

import {
  getDataFromExtracted,
  getDataFromIdea,
} from '../../src/apps/pinch/components/recipes/recipeFormModel.ts';
import {
  MAX_COVER_URL_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
} from '../../src/apps/pinch/constants.ts';
import type { Idea } from '../../src/apps/pinch/types.ts';
import { normalizeExtractedRecipe } from '../../src/apps/pinch/utils/normalizeRecipe.ts';
import {
  getExtraLinks,
  getIdeaExtras,
  getPageExtras,
  getVideoExtras,
  NO_EXTRAS,
  withPageFallbacks,
} from '../../src/apps/pinch/utils/readExtras.ts';
import {
  getYouTubeWatchUrl,
  toRecipeLinks,
} from '../../src/apps/pinch/utils/recipeLinks.ts';

const ID = 'aqz-KE-bpKQ';
const WATCH = `https://www.youtube.com/watch?v=${ID}`;

// a video is kept at its usual address, whichever way it was shared, without the tracking a shared link carries
assert.equal(getYouTubeWatchUrl(`https://youtu.be/${ID}?si=abc123`), WATCH);
assert.equal(getYouTubeWatchUrl(`https://www.youtube.com/shorts/${ID}`), WATCH);
assert.equal(
  getYouTubeWatchUrl(`https://m.youtube.com/watch?v=${ID}&feature=share&t=42s`),
  `${WATCH}&t=42s`,
  'a start time is kept',
);
assert.equal(
  getYouTubeWatchUrl(`https://youtu.be/${ID}?t=evil"onload=x`),
  WATCH,
  'a start time that is not a time is dropped',
);
assert.equal(
  getYouTubeWatchUrl(`https://youtu.be/${ID}?t=1h2m3s`),
  `${WATCH}&t=1h2m3s`,
  'hours are kept',
);
assert.equal(getYouTubeWatchUrl('https://www.youtube.com/@channel'), null);
assert.equal(
  getYouTubeWatchUrl('https://example.com/watch?v=aqz-KE-bpKQ'),
  null,
);

// a video offers its own picture (the large one first, then the standard one) and itself as the how-to
const video = getVideoExtras(`https://youtu.be/${ID}?si=abc`);
assert.deepEqual(video.link, { kind: 'HOW_TO', url: WATCH });
assert.deepEqual(
  video.photos.map((photo) => photo.imageUrl),
  [
    `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
  ],
);
assert.ok(video.photos.every((photo) => photo.host === 'youtube.com'));
assert.deepEqual(getVideoExtras('https://example.com/recipe'), NO_EXTRAS);

// a page offers its social-preview picture and itself as the original recipe
const page = {
  url: 'https://www.seriouseats.com/adobo',
  title: 'Chicken Adobo Recipe | Serious Eats',
  meta: {
    description: 'Sour, salty and a little sweet.',
    image: 'https://www.seriouseats.com/thmb/adobo.jpg',
    siteName: 'Serious Eats',
    author: null,
  },
};
const pageExtras = getPageExtras(page, 'https://seriouseats.com/adobo?utm=x');
assert.equal(pageExtras.photos.length, 1);
assert.equal(pageExtras.photos[0].imageUrl, page.meta.image);
assert.equal(
  pageExtras.photos[0].host,
  'seriouseats.com',
  'the page, not the CDN',
);
assert.deepEqual(pageExtras.link, { kind: 'ORIGINAL', url: page.url });
assert.equal(
  getPageExtras({ ...page, url: '' }, 'https://seriouseats.com/adobo').link
    ?.url,
  'https://seriouseats.com/adobo',
  'the typed address stands in when the page gives none',
);

// a picture that is not a safe web cover is never offered, and the page link still is
for (const image of [
  null,
  'http://example.com/a.jpg',
  'data:image/png;base64,AAAA',
  `https://example.com/${'a'.repeat(MAX_COVER_URL_LENGTH)}.jpg`,
  'https://user:pw@example.com/a.jpg',
]) {
  const extras = getPageExtras(
    { ...page, meta: { ...page.meta, image } },
    'https://seriouseats.com/adobo',
  );
  assert.deepEqual(extras.photos, [], String(image).slice(0, 40));
  assert.equal(extras.link?.kind, 'ORIGINAL');
}

// an idea offers what its link would, from the picture it kept
const idea = (overrides: Partial<Idea>): Idea => ({
  id: 'i1',
  kind: 'LINK',
  title: 'Adobo',
  note: null,
  url: 'https://www.seriouseats.com/adobo',
  siteName: null,
  imageUrl: 'https://www.seriouseats.com/thmb/adobo.jpg',
  photoPath: null,
  recipeId: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});
const fromIdea = getIdeaExtras(idea({}));
assert.equal(
  fromIdea.photos[0]?.imageUrl,
  'https://www.seriouseats.com/thmb/adobo.jpg',
);
assert.equal(fromIdea.link?.kind, 'ORIGINAL');
assert.deepEqual(
  getIdeaExtras(idea({ url: `https://youtu.be/${ID}`, imageUrl: null })),
  getVideoExtras(WATCH),
  'a video idea is a how-to with the video picture even when it kept none',
);
assert.deepEqual(getIdeaExtras(idea({ kind: 'TEXT', url: null })), NO_EXTRAS);
assert.deepEqual(getIdeaExtras(idea({ kind: 'PHOTO', url: null })), NO_EXTRAS);

// a title or description the reader left empty comes from the page; one it read is never replaced
const read = normalizeExtractedRecipe({
  ingredients: [{ name: 'Chicken thigh', amount: 2, unit: 'LB', note: null }],
  steps: ['Simmer.'],
});
const filled = withPageFallbacks(read, page);
assert.equal(
  filled.title,
  'Chicken Adobo Recipe',
  'the site after the bar is dropped',
);
assert.equal(filled.description, 'Sour, salty and a little sweet.');
const titleOf = (title: string) =>
  withPageFallbacks(read, { title, meta: undefined }).title;
assert.equal(
  titleOf("Mom's Best - Chicken Noodle Soup | Kitchn"),
  "Mom's Best - Chicken Noodle Soup",
  'only the last segment is dropped',
);
assert.equal(titleOf('Adobo | X'), 'Adobo');
assert.equal(
  titleOf('A | Chicken Adobo Site'),
  'A | Chicken Adobo Site',
  'a cut that leaves almost nothing is not made',
);
const kept = withPageFallbacks(
  { ...read, title: 'My adobo', description: 'Mine.' },
  page,
);
assert.equal(kept.title, 'My adobo');
assert.equal(kept.description, 'Mine.');
assert.equal(
  withPageFallbacks(read, { title: null, meta: undefined }).title,
  null,
  'nothing to fill from',
);
assert.ok(
  (withPageFallbacks(read, {
    title: null,
    meta: { ...page.meta, description: 'word '.repeat(2000) },
  }).description?.length ?? 0) <= MAX_RECIPE_DESCRIPTION_LENGTH,
  'a long description is cut',
);

// the form starts with the source's address as a link: a video in the how-to slot, a page as a row
const videoData = getDataFromExtracted(read, [], video);
assert.equal(videoData.links.howTo.url, WATCH);
assert.deepEqual(videoData.links.others, []);
const pageData = getDataFromExtracted(read, [], pageExtras);
assert.equal(pageData.links.howTo.url, '');
assert.equal(pageData.links.others.length, 1);
assert.equal(pageData.links.others[0].kind, 'ORIGINAL');
assert.equal(
  pageData.links.others[0].isCustom,
  false,
  'it wears the default label',
);
assert.deepEqual(
  toRecipeLinks(pageData.links).map(({ kind, label, url }) => ({
    kind,
    label,
    url,
  })),
  [{ kind: 'ORIGINAL', label: null, url: page.url }],
);
assert.equal(
  getDataFromExtracted(read, []).links.others.length,
  0,
  'a text or file reading adds none',
);
assert.equal(getDataFromExtracted(read, []).links.howTo.url, '');
assert.deepEqual(getExtraLinks(NO_EXTRAS), []);

// a form made from an idea starts with the same link
const ideaData = getDataFromIdea(idea({}), []);
assert.equal(ideaData.links.others[0]?.kind, 'ORIGINAL');
assert.equal(
  ideaData.links.others[0]?.url,
  'https://www.seriouseats.com/adobo',
);
assert.equal(
  getDataFromIdea(idea({ url: `https://youtu.be/${ID}` }), []).links.howTo.url,
  WATCH,
);
assert.equal(
  getDataFromIdea(idea({ kind: 'TEXT', url: null }), []).links.others.length,
  0,
);

console.log('pinch read extras: ok');
