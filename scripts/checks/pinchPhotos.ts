import assert from 'node:assert/strict';

import { toHttpsUrl } from '../../functions/src/imageSearch/results.ts';
import {
  MAX_COVER_URL_LENGTH,
  PHOTO_QUERY_MAX_TITLE_LENGTH,
  PHOTO_RESULT_COUNT,
} from '../../src/apps/pinch/constants.ts';
import type { WebPhoto } from '../../src/apps/pinch/types.ts';
import {
  getCoverFields,
  getPhotoQuery,
  getPhotoQueryKey,
  getShownCover,
  getUrlHost,
  hasCover,
  isCoverUrl,
  toWebPhotos,
} from '../../src/apps/pinch/utils/recipeCover.ts';

const photo = (n: number, extra: Partial<WebPhoto> = {}): WebPhoto => ({
  thumbUrl: `https://t.example.net/${n}`,
  imageUrl: `https://img.example.com/${n}.jpg`,
  title: `Pie ${n}`,
  host: 'cooking.example.org',
  ...extra,
});

// a recipe has a cover when it has either kind
assert.equal(hasCover({ coverPath: null, coverUrl: null }), false);
assert.equal(hasCover({ coverPath: 'a/b.webp', coverUrl: null }), true);
assert.equal(
  hasCover({ coverPath: null, coverUrl: 'https://a.example/x.jpg' }),
  true,
);
assert.equal(
  hasCover({ coverPath: null } as Parameters<typeof hasCover>[0]),
  false,
  'a recipe written before web covers has no coverUrl key and reads as none',
);

// the address a recipe keeps: https, a length the rules take, no sign-in in it
assert.equal(isCoverUrl('https://a.example/x.jpg'), true);
assert.equal(isCoverUrl('https://a.example'), true);
assert.equal(isCoverUrl('https://a.example/x.jpg?w=300&h=200#top'), true);
assert.equal(isCoverUrl('http://a.example/x.jpg'), false);
assert.equal(isCoverUrl('ftp://a.example/x.jpg'), false);
assert.equal(isCoverUrl('javascript:alert(1)'), false);
assert.equal(isCoverUrl('data:image/png;base64,AAAA'), false);
assert.equal(isCoverUrl('https://user:pw@a.example/x.jpg'), false);
assert.equal(isCoverUrl('https://user@a.example/x.jpg'), false);
assert.equal(isCoverUrl('//a.example/x.jpg'), false);
assert.equal(isCoverUrl('a.example/x.jpg'), false);
assert.equal(isCoverUrl(''), false);
assert.equal(isCoverUrl(null), false);
assert.equal(isCoverUrl(7), false);
const longPath = (length: number) =>
  `https://a.example/${'x'.repeat(length - 'https://a.example/'.length)}`;
assert.equal(
  isCoverUrl(longPath(MAX_COVER_URL_LENGTH)),
  true,
  'exactly the cap is kept',
);
assert.equal(
  isCoverUrl(longPath(MAX_COVER_URL_LENGTH + 1)),
  false,
  'one over is not',
);

// the app and the function agree on which addresses are safe to show
[
  'https://a.example/x.jpg',
  'http://a.example/x.jpg',
  'https://user:pw@a.example/x.jpg',
  'https://user@a.example/x.jpg',
  'javascript:alert(1)',
  'not a url',
  '//a.example/x.jpg',
  longPath(MAX_COVER_URL_LENGTH),
  longPath(MAX_COVER_URL_LENGTH + 1),
].forEach((url) => {
  assert.equal(
    isCoverUrl(url),
    toHttpsUrl(url) !== null,
    `the app and the function agree about ${url.slice(0, 40)}`,
  );
});

assert.equal(getUrlHost('https://www.example.com/a'), 'example.com');
assert.equal(getUrlHost('https://img.example.com/a'), 'img.example.com');
assert.equal(getUrlHost('nope'), '');

// what the search is asked for
assert.equal(getPhotoQuery('Adobo chicken'), 'Adobo chicken recipe');
assert.equal(getPhotoQuery('  Adobo   chicken \n'), 'Adobo chicken recipe');
assert.equal(getPhotoQuery(''), null, 'no title, no search');
assert.equal(getPhotoQuery('  '), null);
assert.equal(getPhotoQuery('ab'), null, 'two letters are not worth a search');
assert.equal(getPhotoQuery('Pie'), 'Pie recipe');
{
  const query = getPhotoQuery('x'.repeat(200));
  assert.equal(
    query,
    `${'x'.repeat(PHOTO_QUERY_MAX_TITLE_LENGTH)} recipe`,
    'a long title is cut and still ends in the word recipe',
  );
  assert.ok(
    (query ?? '').length <= 80,
    "and fits the function's 80 characters",
  );
}
assert.equal(
  getPhotoQuery(`${'a'.repeat(PHOTO_QUERY_MAX_TITLE_LENGTH - 1)} b`),
  `${'a'.repeat(PHOTO_QUERY_MAX_TITLE_LENGTH - 1)} recipe`,
  'a cut never leaves a double space',
);
assert.equal(getPhotoQueryKey('Apple  Pie recipe'), 'apple pie recipe');
assert.equal(
  getPhotoQueryKey(getPhotoQuery('Apple Pie') ?? ''),
  getPhotoQueryKey(getPhotoQuery(' apple   PIE ') ?? ''),
  'the same words are one search whatever the case or spacing',
);

// the function's answer is checked again, and copied by name
assert.deepEqual(toWebPhotos([photo(1)]), [photo(1)]);
assert.deepEqual(toWebPhotos(undefined), []);
assert.deepEqual(toWebPhotos('x'), []);
assert.deepEqual(toWebPhotos({ results: [] }), []);
assert.equal(
  toWebPhotos(Array.from({ length: 20 }, (_, index) => photo(index))).length,
  PHOTO_RESULT_COUNT,
  'at most six, whatever comes back',
);
assert.deepEqual(
  toWebPhotos([
    photo(1, { imageUrl: 'http://img.example.com/1.jpg' }),
    photo(2, { thumbUrl: 'http://t.example.net/2' }),
    null,
    7,
    'text',
    photo(3),
  ]).map((entry) => entry.title),
  ['Pie 3'],
  'a picture or thumbnail that is not https is dropped, and odd rows are skipped',
);
assert.deepEqual(
  Object.keys(
    toWebPhotos([{ ...photo(1), owner: 'someone', secret: 'x' }])[0],
  ).sort(),
  ['host', 'imageUrl', 'thumbUrl', 'title'],
  'only the four fields are kept',
);
assert.equal(
  toWebPhotos([{ ...photo(1), host: 7, title: null }])[0].host,
  'img.example.com',
  "a missing host falls back to the picture's own site",
);
assert.equal(toWebPhotos([{ ...photo(1), title: null }])[0].title, '');

// what a save writes: at most one kind of cover, the one chosen last
const uploadPath = 'apps/pinch/kitchens/u/recipes/r/cover.webp';
const choice = (
  extra: Partial<Parameters<typeof getCoverFields>[0]> = {},
): Parameters<typeof getCoverFields>[0] => ({
  uploadPath,
  hasFile: false,
  webUrl: null,
  removeCover: false,
  existing: null,
  ...extra,
});
assert.deepEqual(getCoverFields(choice()), { coverPath: null, coverUrl: null });
assert.deepEqual(
  getCoverFields(choice({ hasFile: true })),
  { coverPath: uploadPath, coverUrl: null },
  'an upload is written and clears any web address',
);
assert.deepEqual(
  getCoverFields(choice({ webUrl: 'https://i.example/1.jpg' })),
  { coverPath: null, coverUrl: 'https://i.example/1.jpg' },
  'a web photo is written and clears any upload',
);
assert.deepEqual(
  getCoverFields(
    choice({
      hasFile: true,
      webUrl: 'https://i.example/1.jpg',
      existing: { coverPath: null, coverUrl: 'https://old.example/1.jpg' },
    }),
  ),
  { coverPath: uploadPath, coverUrl: null },
  'never both, even if a draft carried both',
);
assert.deepEqual(
  getCoverFields(
    choice({
      removeCover: true,
      existing: { coverPath: uploadPath, coverUrl: null },
    }),
  ),
  { coverPath: null, coverUrl: null },
  'Remove clears an upload',
);
assert.deepEqual(
  getCoverFields(
    choice({
      removeCover: true,
      existing: { coverPath: null, coverUrl: 'https://old.example/1.jpg' },
    }),
  ),
  { coverPath: null, coverUrl: null },
  'and a web photo',
);
assert.deepEqual(
  getCoverFields(
    choice({ existing: { coverPath: uploadPath, coverUrl: null } }),
  ),
  { coverPath: uploadPath, coverUrl: null },
  'an edit that leaves the photo alone keeps the upload',
);
assert.deepEqual(
  getCoverFields(
    choice({
      existing: { coverPath: null, coverUrl: 'https://old.example/1.jpg' },
    }),
  ),
  { coverPath: null, coverUrl: 'https://old.example/1.jpg' },
  'and keeps the web photo',
);
assert.deepEqual(
  getCoverFields(
    choice({
      existing: { coverPath: null } as Parameters<
        typeof getCoverFields
      >[0]['existing'],
    }),
  ),
  { coverPath: null, coverUrl: null },
  'a recipe written before web covers is written back with the key, as null',
);
assert.deepEqual(
  getCoverFields(
    choice({
      webUrl: 'https://i.example/2.jpg',
      existing: { coverPath: uploadPath, coverUrl: null },
    }),
  ),
  { coverPath: null, coverUrl: 'https://i.example/2.jpg' },
  'a web photo replaces an upload',
);

// what the form shows: an upload picked now beats a web photo picked now, which beats what the recipe had
const shown = (extra: Partial<Parameters<typeof getShownCover>[0]> = {}) =>
  getShownCover({
    uploadUrl: null,
    web: null,
    isRemoved: false,
    savedWebUrl: null,
    storageUrl: null,
    ...extra,
  });
assert.equal(shown(), null);
assert.deepEqual(shown({ uploadUrl: 'blob:x' }), {
  url: 'blob:x',
  thumbUrl: 'blob:x',
  host: null,
});
assert.deepEqual(shown({ web: photo(1) }), {
  url: photo(1).imageUrl,
  thumbUrl: photo(1).thumbUrl,
  host: 'cooking.example.org',
});
assert.equal(
  shown({ uploadUrl: 'blob:x', web: photo(1) })?.url,
  'blob:x',
  'an upload wins over a web photo that is still in state',
);
assert.equal(
  shown({ web: photo(1), storageUrl: 'https://firebasestorage.example/c' })
    ?.url,
  photo(1).imageUrl,
  'a web photo picked now replaces the saved upload',
);
assert.equal(
  shown({
    isRemoved: true,
    savedWebUrl: 'https://old.example/1.jpg',
    storageUrl: 'https://s.example/c',
  }),
  null,
  'Remove shows nothing',
);
assert.equal(
  shown({ isRemoved: true, web: photo(1) })?.url,
  photo(1).imageUrl,
  'a web photo picked after Remove shows',
);
assert.deepEqual(shown({ savedWebUrl: 'https://www.old.example/1.jpg' }), {
  url: 'https://www.old.example/1.jpg',
  thumbUrl: 'https://www.old.example/1.jpg',
  host: 'old.example',
});
assert.deepEqual(shown({ storageUrl: 'https://s.example/c' }), {
  url: 'https://s.example/c',
  thumbUrl: 'https://s.example/c',
  host: null,
});
assert.equal(
  shown({
    savedWebUrl: 'https://old.example/1.jpg',
    storageUrl: 'https://s.example/c',
  })?.host,
  'old.example',
  'a saved web photo names its site; an upload never says "From"',
);

console.log('pinch photos checks passed');
