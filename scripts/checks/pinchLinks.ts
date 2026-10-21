import assert from 'node:assert/strict';

import { MAX_LINK_URL_LENGTH } from '../../src/apps/pinch/constants.ts';
import {
  canAddLink,
  cleanLinks,
  countLinkSlots,
  getLinkLabel,
  getLinksSummary,
  getInlineVideo,
  getLinksText,
  getLinkUrlProblem,
  getRecipeLinks,
  getYouTubeId,
  getYouTubeThumbnailUrl,
  hasLinksProblem,
  isOverLinkCap,
  normalizeLinkUrl,
  toRecipeLinks,
  type LinkDraft,
  type LinksText,
} from '../../src/apps/pinch/utils/recipeLinks.ts';
import type { RecipeLink } from '../../src/apps/pinch/types.ts';

const ID = 'aqz-KE-bpKQ';

// the video id is found in every way people share a YouTube link
assert.equal(getYouTubeId(`https://youtu.be/${ID}`), ID);
assert.equal(getYouTubeId(`https://youtu.be/${ID}?si=abc123&t=42`), ID);
assert.equal(getYouTubeId(`https://www.youtube.com/watch?v=${ID}`), ID);
assert.equal(
  getYouTubeId(`https://youtube.com/watch?feature=share&v=${ID}&t=9s`),
  ID,
);
assert.equal(getYouTubeId(`https://m.youtube.com/watch?v=${ID}`), ID);
assert.equal(getYouTubeId(`https://music.youtube.com/watch?v=${ID}`), ID);
assert.equal(getYouTubeId(`https://www.youtube.com/shorts/${ID}`), ID);
assert.equal(
  getYouTubeId(`https://www.youtube.com/shorts/${ID}?feature=share`),
  ID,
);
assert.equal(getYouTubeId(`https://www.youtube.com/embed/${ID}`), ID);
assert.equal(getYouTubeId(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
assert.equal(getYouTubeId(`https://www.youtube.com/live/${ID}`), ID);
assert.equal(
  getYouTubeId(`https://www.youtube.com/watch?list=PLabc&v=${ID}`),
  ID,
);
assert.equal(getYouTubeId(`www.youtube.com/watch?v=${ID}`), ID, 'no scheme');
assert.equal(getYouTubeId(`  https://youtu.be/${ID}\n`), ID, 'trimmed');
assert.equal(
  getYouTubeId(`watch this https://youtu.be/${ID} it helps`),
  ID,
  'one link among words',
);
assert.equal(getYouTubeId(`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`), ID, 'case');

// anything that is not one video on YouTube has no id
assert.equal(
  getYouTubeId('https://www.youtube.com/playlist?list=PLabc123'),
  null,
);
assert.equal(getYouTubeId('https://www.youtube.com/@somechannel'), null);
assert.equal(getYouTubeId('https://www.youtube.com/watch?v=short'), null);
assert.equal(getYouTubeId(`https://www.youtube.com/watch?v=${ID}extra`), null);
assert.equal(getYouTubeId('https://www.youtube.com/watch'), null);
assert.equal(getYouTubeId(`https://youtu.be/`), null);
assert.equal(getYouTubeId(`https://evilyoutube.com/watch?v=${ID}`), null);
assert.equal(
  getYouTubeId(`https://youtube.com.evil.example/watch?v=${ID}`),
  null,
);
assert.equal(getYouTubeId(`https://notyoutu.be/${ID}`), null);
assert.equal(getYouTubeId(`https://vimeo.com/123456789`), null);
assert.equal(getYouTubeId(`javascript:alert('${ID}')`), null);
assert.equal(
  getYouTubeId(`https://youtu.be/${ID} https://youtu.be/${ID}`),
  null,
  'two links',
);
assert.equal(getYouTubeId(''), null);
assert.equal(
  getYouTubeThumbnailUrl(ID),
  `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
);

// the how-to video plays in place only for hosts react-player is given here, from the no-cookie host for YouTube
assert.deepEqual(getInlineVideo(`https://youtu.be/${ID}?si=abc`), {
  src: `https://www.youtube-nocookie.com/embed/${ID}`,
  thumbnailUrl: getYouTubeThumbnailUrl(ID),
});
assert.deepEqual(
  getInlineVideo(`https://www.youtube.com/watch?v=${ID}&t=90s`),
  {
    src: `https://www.youtube-nocookie.com/embed/${ID}?t=90s`,
    thumbnailUrl: getYouTubeThumbnailUrl(ID),
  },
);
assert.equal(
  getInlineVideo(`https://www.youtube.com/watch?v=${ID}&t=x%22y`)?.src,
  `https://www.youtube-nocookie.com/embed/${ID}`,
  'a start time that is not digits, m and s is left out',
);
assert.deepEqual(getInlineVideo('https://vimeo.com/123456789'), {
  src: 'https://vimeo.com/123456789',
  thumbnailUrl: null,
});
assert.equal(
  getInlineVideo('https://player.vimeo.com/video/123456789')?.src,
  'https://vimeo.com/123456789',
);
assert.equal(
  getInlineVideo('https://vimeo.com/123456789/abcdef1234')?.src,
  'https://vimeo.com/123456789/abcdef1234',
  'a private link keeps its hash',
);
assert.equal(getInlineVideo('https://vimeo.com/somechannel'), null);
assert.equal(getInlineVideo('https://vimeo.com/channels/staffpicks'), null);
assert.equal(
  getInlineVideo('https://www.youtube.com/playlist?list=PLabc'),
  null,
);
assert.equal(getInlineVideo('https://example.com/video.mp4'), null);
assert.equal(getInlineVideo('https://evil.example/vimeo.com/123456789'), null);
assert.equal(getInlineVideo('not a link'), null);

// a pasted address becomes one http(s) link, never a glued pair
assert.equal(
  normalizeLinkUrl('  https://example.com/a?b=1  '),
  'https://example.com/a?b=1',
);
assert.equal(normalizeLinkUrl('example.com/pie'), 'https://example.com/pie');
assert.equal(
  normalizeLinkUrl('see https://example.com/pie for more'),
  'https://example.com/pie',
);
assert.equal(
  normalizeLinkUrl('https://example.com/pie\nhttps://example.org/cake'),
  null,
  'two links',
);
assert.equal(
  normalizeLinkUrl('example.com/very-\nlong-path'),
  'https://example.com/very-long-path',
  'a link wrapped over lines, with no scheme',
);
assert.equal(normalizeLinkUrl('ftp://example.com/pie'), null);
assert.equal(normalizeLinkUrl("javascript:alert('x')"), null);
assert.equal(normalizeLinkUrl('data:text/html,hi'), null);
assert.equal(
  normalizeLinkUrl('https://user:pass@example.com/'),
  null,
  'credentials',
);
assert.equal(normalizeLinkUrl('not a link'), null);
assert.equal(normalizeLinkUrl(''), null);
assert.equal(
  normalizeLinkUrl('https://example.com/' + 'a'.repeat(MAX_LINK_URL_LENGTH)),
  null,
  'over the length cap',
);
assert.notEqual(
  normalizeLinkUrl(
    'https://example.com/' + 'a'.repeat(MAX_LINK_URL_LENGTH - 30),
  ),
  null,
  'just under it',
);
assert.equal(getLinkUrlProblem(''), null);
assert.equal(getLinkUrlProblem('https://example.com'), null);
assert.match(getLinkUrlProblem('hello') ?? '', /web address/);
assert.match(
  getLinkUrlProblem('https://a.com https://b.com') ?? '',
  /more than one/,
);

const link = (
  id: string,
  kind: RecipeLink['kind'],
  url = `https://example.com/${id}`,
  label: string | null = null,
): RecipeLink => ({ id, kind, label, url });

// a recipe written before links has none, and hostile content is cut down
assert.deepEqual(getRecipeLinks({}), []);
assert.deepEqual(getRecipeLinks({ links: undefined }), []);
assert.deepEqual(cleanLinks(null), []);
assert.deepEqual(cleanLinks('https://example.com'), []);
assert.deepEqual(cleanLinks({ url: 'https://example.com' }), []);
assert.deepEqual(
  cleanLinks([null, 3, 'x', [], {}, { url: 7 }, { url: 'nope' }]),
  [],
);
assert.deepEqual(
  cleanLinks([
    {
      id: 'a',
      kind: 'ARTICLE',
      label: "  Mom's   note  ",
      url: 'https://example.com/a',
      extra: 'x',
    },
  ]),
  [
    {
      id: 'a',
      kind: 'ARTICLE',
      label: "Mom's note",
      url: 'https://example.com/a',
    },
  ],
);
assert.equal(
  cleanLinks([{ kind: 'BOGUS', url: 'https://example.com' }])[0].kind,
  'OTHER',
);
assert.equal(
  cleanLinks([{ kind: 'OTHER', url: 'https://example.com', label: '   ' }])[0]
    .label,
  null,
);
assert.equal(
  cleanLinks([
    { kind: 'OTHER', url: 'https://example.com', label: 'x'.repeat(100) },
  ])[0].label?.length,
  40,
);
assert.deepEqual(
  cleanLinks([
    { kind: 'OTHER', url: 'https://example.com/a' },
    { id: '', kind: 'OTHER', url: 'https://example.com/b' },
  ]).map((entry) => entry.id),
  ['link-0', 'link-1'],
  'a missing id reads the same on every render',
);

// a recipe has one how-to video, and at most eight links
const twoHowTos = cleanLinks([
  link('first', 'HOW_TO'),
  link('second', 'HOW_TO'),
  link('third', 'ARTICLE'),
]);
assert.deepEqual(
  twoHowTos.map((entry) => entry.kind),
  ['HOW_TO', 'OTHER', 'ARTICLE'],
);
assert.equal(twoHowTos.filter((entry) => entry.kind === 'HOW_TO').length, 1);
assert.equal(
  cleanLinks(
    Array.from({ length: 12 }, (_, index) => link(`l${index}`, 'OTHER')),
  ).length,
  8,
);
assert.equal(
  cleanLinks(
    Array.from({ length: 8 }, (_, index) => link(`l${index}`, 'OTHER')),
  ).length,
  8,
);

// labels: a custom one replaces the default, none shows the default
assert.equal(getLinkLabel(link('a', 'HOW_TO')), 'How-to video');
assert.equal(getLinkLabel(link('a', 'ARTICLE')), 'Article');
assert.equal(getLinkLabel(link('a', 'ORIGINAL')), 'Original recipe');
assert.equal(getLinkLabel(link('a', 'TECHNIQUE')), 'Technique');
assert.equal(getLinkLabel(link('a', 'OTHER')), 'Link');
assert.equal(
  getLinkLabel(
    link('a', 'ARTICLE', 'https://example.com', 'Kenji on browning'),
  ),
  'Kenji on browning',
);

const draft = (
  id: string,
  url: string,
  patch: Partial<LinkDraft> = {},
): LinkDraft => ({
  id,
  kind: 'OTHER',
  label: '',
  isCustom: false,
  url,
  ...patch,
});
const howTo = (url: string) => ({ id: 'how', label: null, url });
const text = (howToUrl: string, others: LinkDraft[]): LinksText => ({
  howTo: howTo(howToUrl),
  others,
});

// the form saves the how-to first, drops blanks and keeps a custom label only while it is chosen
const saved = toRecipeLinks(
  text(`https://youtu.be/${ID}`, [
    draft('a', 'https://example.com/a', { kind: 'ARTICLE' }),
    draft('blank', '   '),
    draft('b', 'example.org/b', { isCustom: true, label: " Joe's  trick " }),
    draft('c', 'https://example.com/c', {
      kind: 'TECHNIQUE',
      label: 'left over',
      isCustom: false,
    }),
  ]),
);
assert.deepEqual(
  saved.map((entry) => [entry.id, entry.kind, entry.label, entry.url]),
  [
    ['how', 'HOW_TO', null, `https://youtu.be/${ID}`],
    ['a', 'ARTICLE', null, 'https://example.com/a'],
    ['b', 'OTHER', "Joe's trick", 'https://example.org/b'],
    ['c', 'TECHNIQUE', null, 'https://example.com/c'],
  ],
);
assert.equal(saved.filter((entry) => entry.kind === 'HOW_TO').length, 1);
assert.deepEqual(toRecipeLinks(text('', [])), []);
assert.deepEqual(toRecipeLinks(text('   ', [draft('x', '')])), []);
assert.equal(
  toRecipeLinks(
    text(
      '',
      Array.from({ length: 12 }, (_, index) =>
        draft(`r${index}`, `https://example.com/${index}`),
      ),
    ),
  ).length,
  8,
);

// reading a recipe back into the form and saving it again changes nothing
const stored: RecipeLink[] = [
  link('v', 'HOW_TO', `https://youtu.be/${ID}`, 'Watch Mom do it'),
  link('p', 'ARTICLE'),
  link('q', 'OTHER', 'https://example.com/q', 'Her blog'),
];
assert.deepEqual(toRecipeLinks(getLinksText(stored)), stored);
assert.deepEqual(toRecipeLinks(getLinksText([])), []);
assert.equal(getLinksText([]).howTo.url, '');
assert.equal(getLinksText(stored).others.length, 2);

// an address that can't be saved blocks the save, a blank one never does
assert.equal(hasLinksProblem(text('', [draft('a', '')])), false);
assert.equal(
  hasLinksProblem(
    text('https://youtu.be/' + ID, [draft('a', 'https://example.com')]),
  ),
  false,
);
assert.equal(hasLinksProblem(text('nope', [])), true);
assert.equal(hasLinksProblem(text('', [draft('a', 'nope')])), true);

// the cap counts the how-to slot once it holds something and each row with an address; a row still waiting for its address holds the next one back
const filled = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    draft(`r${index}`, `https://example.com/${index}`),
  );
assert.equal(canAddLink(text('', filled(7))), true);
assert.equal(canAddLink(text('', filled(8))), false);
assert.equal(canAddLink(text('https://youtu.be/' + ID, filled(7))), false);
assert.equal(canAddLink(text('', [...filled(2), draft('wait', '')])), false);
assert.equal(canAddLink(text('', [])), true);
assert.equal(countLinkSlots(text('', [...filled(2), draft('wait', '  ')])), 2);
assert.equal(countLinkSlots(text('https://youtu.be/' + ID, filled(2))), 3);
assert.equal(isOverLinkCap(text('', filled(8))), false);
assert.equal(isOverLinkCap(text('', filled(9))), true);
assert.equal(isOverLinkCap(text('https://youtu.be/' + ID, filled(8))), true);

// the Links row says what it holds in one line
assert.equal(getLinksSummary(text('', [])), '');
assert.equal(
  getLinksSummary(text('https://youtu.be/' + ID, [])),
  'How-to video',
);
assert.equal(
  getLinksSummary(text('', [draft('a', 'https://example.com')])),
  '1 link',
);
assert.equal(
  getLinksSummary(
    text('', [
      draft('a', 'https://example.com'),
      draft('b', 'https://example.org'),
    ]),
  ),
  '2 links',
);
assert.equal(
  getLinksSummary(
    text('https://youtu.be/' + ID, [
      draft('a', 'https://example.com'),
      draft('b', ''),
    ]),
  ),
  'How-to video + 1 link',
);

console.log('pinch links checks passed');
