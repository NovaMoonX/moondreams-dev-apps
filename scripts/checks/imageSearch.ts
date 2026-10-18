import assert from 'node:assert/strict';

import { fetchCapped } from '../../functions/src/imageSearch/fetchCapped.ts';
import {
  createDdgProvider,
  findToken,
} from '../../functions/src/imageSearch/ddg.ts';
import { createGoogleProvider } from '../../functions/src/imageSearch/google.ts';
import { createOptionalSecretReader } from '../../functions/src/imageSearch/optionalSecret.ts';
import {
  DEFAULT_PROVIDER_LIST,
  parseProviderList,
} from '../../functions/src/imageSearch/providers.ts';
import {
  MAX_ROWS_READ,
  toHttpsUrl,
  toImageResult,
  toImageResults,
} from '../../functions/src/imageSearch/results.ts';
import {
  EMPTY_TTL_MS,
  MAX_QUERY_LENGTH,
  RESULTS_TTL_MS,
  getCacheId,
  normalizeQuery,
  searchImages,
  type CacheEntry,
  type SearchDeps,
} from '../../functions/src/imageSearch/searchImages.ts';
import {
  ImageSearchError,
  ProviderFailure,
  type FetchLike,
  type ImageProvider,
  type ImageResult,
} from '../../functions/src/imageSearch/types.ts';
import {
  PERSON_PER_DAY,
  PERSON_PER_WINDOW,
  PERSON_WINDOW_MS,
  getQuotaDay,
  readCap,
  stepBudget,
  stepPersonUsage,
  type PersonUsage,
} from '../../functions/src/imageSearch/usage.ts';

const TOKEN = '4-123456789012345678901234567890123';
const PAGE = `<html><script>var x = {vqd="${TOKEN}",q:"pie"};</script></html>`;
const SECRET = 'SECRETKEYVALUE-abc123';

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  image: `https://img.example.com/${n}.jpg`,
  thumbnail: `https://tse.example.net/th?id=${n}`,
  title: `Pie ${n}`,
  url: `https://www.cooking.example.org/pie-${n}`,
  height: 100,
  width: 100,
  source: 'Bing',
  ...extra,
});
const ddgJson = (rows: unknown[]) => JSON.stringify({ results: rows });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const text = (body: string, status = 200) => new Response(body, { status });

const gItem = (n: number, extra: Record<string, unknown> = {}) => ({
  title: `Soup ${n}`,
  link: `https://pics.example.com/${n}.jpg`,
  image: {
    contextLink: `https://www.kitchen.example.org/soup-${n}`,
    thumbnailLink: `https://encrypted-tbn0.example.net/images?q=${n}`,
  },
  ...extra,
});

interface Call {
  url: string;
  headers: Record<string, string>;
}

/** A fake `fetch` that answers by the address and remembers what it was asked. */
const fakeFetch = (
  answer: (url: URL, calls: Call[]) => Response | Promise<Response>,
) => {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return answer(new URL(url), calls);
  };
  return { fetch, calls };
};

const hang: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    );
  });

const ddgFetch = (rowsPerCall: unknown[][], pageStatus = 200, page = PAGE) => {
  const state = { image: 0 };
  return fakeFetch((url) => {
    if (url.pathname === '/i.js') {
      const rows = rowsPerCall[Math.min(state.image, rowsPerCall.length - 1)];
      state.image += 1;
      return text(ddgJson(rows));
    }
    return text(page, pageStatus);
  });
};

const signal = () => new AbortController().signal;

const rejectsWith = async (promise: Promise<unknown>, reason: string) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof ProviderFailure, `a ProviderFailure (${reason})`);
  assert.equal((error as ProviderFailure).reason, reason);
};

const countImageCalls = (calls: Call[]) =>
  calls.filter((call) => call.url.includes('/i.js')).length;

// results are copied by name, https only, and capped
assert.equal(toHttpsUrl('https://a.example/x.jpg'), 'https://a.example/x.jpg');
assert.equal(toHttpsUrl('http://a.example/x.jpg'), null, 'http is dropped');
assert.equal(toHttpsUrl('//a.example/x.jpg'), null);
assert.equal(toHttpsUrl('javascript:alert(1)'), null);
assert.equal(toHttpsUrl('data:image/png;base64,AAAA'), null);
assert.equal(
  toHttpsUrl('https://user:pw@a.example/x.jpg'),
  null,
  'credentials',
);
assert.equal(
  toHttpsUrl('https://user@a.example/x.jpg'),
  null,
  'a user name alone',
);
assert.equal(
  toHttpsUrl(`https://a.example/${'x'.repeat(2000)}`),
  null,
  'too long',
);
assert.equal(toHttpsUrl(42), null);
assert.equal(toHttpsUrl(null), null);
assert.equal(toHttpsUrl('not a url'), null);

const good = toImageResult({
  thumbnail: 'https://t.example/1',
  image: 'https://i.example/1.jpg',
  title: '  Pie \n\t with   cream\u0000 ',
  page: 'https://www.cooking.example.org/pie',
});
assert.deepEqual(good, {
  thumbUrl: 'https://t.example/1',
  imageUrl: 'https://i.example/1.jpg',
  title: 'Pie with cream',
  host: 'cooking.example.org',
});
assert.equal(
  toImageResult({
    thumbnail: 'http://t.example/1',
    image: 'https://i.example/1.jpg',
    title: 'x',
    page: null,
  }),
  null,
  'a non-https thumbnail drops the picture, it never falls back to the full image',
);
assert.equal(
  toImageResult({
    thumbnail: 'https://t.example/1',
    image: 'http://i.example/1.jpg',
    title: 'x',
    page: null,
  }),
  null,
  'a non-https picture is dropped',
);
assert.equal(
  toImageResult({
    thumbnail: 'https://t.example/1',
    image: 'https://www.i.example/1.jpg',
    title: 7,
    page: 'nonsense',
  })?.host,
  'i.example',
  "the picture's own host stands in for a page that can't be read",
);
assert.equal(
  toImageResult({
    thumbnail: 'https://t.example/1',
    image: 'https://i.example/1.jpg',
    title: 'x'.repeat(500),
    page: null,
  })?.title.length,
  120,
  'a title is capped',
);

const many = toImageResults(
  [...Array.from({ length: 20 }, (_, index) => row(index)), row(0)],
  (entry) => ({
    thumbnail: entry.thumbnail,
    image: entry.image,
    title: entry.title,
    page: entry.url,
  }),
);
assert.equal(many.length, 6, 'at most six results');
const toRaw = (entry: Record<string, unknown>) => ({
  thumbnail: entry.thumbnail,
  image: entry.image,
  title: entry.title,
  page: entry.url,
});
assert.deepEqual(
  Object.keys(
    toImageResults([row(1, { secret: 'x', owner: 'someone' })], toRaw)[0],
  ).sort(),
  ['host', 'imageUrl', 'thumbUrl', 'title'],
  "only the four allowlisted fields, never the provider's own object",
);
assert.equal(
  toImageResults([row(1), row(1), row(2)], toRaw).length,
  2,
  'a picture is listed once',
);
assert.deepEqual(toImageResults({ not: 'an array' }, toRaw), []);
assert.deepEqual(toImageResults(null, toRaw), []);
assert.equal(
  toImageResults(
    [null, 7, 'text', [], row(1, { image: 'http://x.example/a.jpg' }), row(2)],
    toRaw,
  ).length,
  1,
  'odd rows are skipped',
);
{
  const started = Date.now();
  const huge = Array.from({ length: 1_000_000 }, () => ({ image: 'x' }));
  assert.deepEqual(toImageResults(huge, toRaw), []);
  assert.ok(
    Date.now() - started < 1000,
    'a million rows cost no more than the first few',
  );
  const late = [
    ...Array.from({ length: MAX_ROWS_READ }, () => ({ image: 'x' })),
    row(1),
  ];
  assert.deepEqual(
    toImageResults(late, toRaw),
    [],
    `only the first ${MAX_ROWS_READ} rows are looked at`,
  );
}

// the token comes from the page in one linear pass
assert.equal(findToken(`xx vqd="${TOKEN}" yy`), TOKEN);
assert.equal(findToken(`xx vqd='${TOKEN}'`), TOKEN);
assert.equal(findToken(`xx vqd=${TOKEN}&q=pie`), TOKEN);
assert.equal(findToken('no token here'), null);
assert.equal(findToken('vqd=abc'), null, 'letters are not a token');
assert.equal(findToken('vqd=12'), null, 'too short');
assert.equal(findToken(`vqd=${'1'.repeat(65)}`), null, 'too long');
assert.equal(
  findToken(`vqd=zz vqd="${TOKEN}"`),
  TOKEN,
  'the next vqd= is tried when the first has no token',
);
{
  const started = Date.now();
  assert.equal(findToken('vqd='.repeat(300_000)), null);
  assert.equal(findToken(`${'a'.repeat(2_000_000)}`), null);
  assert.equal(findToken('vqd=' + '1'.repeat(1_000_000)), null);
  assert.ok(
    Date.now() - started < 1000,
    'a hostile page is scanned in linear time',
  );
}

// a body over the cap is cut off and the stream is cancelled, so it can't hold the instance
{
  const state = { sent: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.sent += 1;
      controller.enqueue(new Uint8Array(64 * 1024).fill(97));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const response = await fetchCapped({
    fetch: async () => new Response(stream, { status: 200 }),
    url: 'https://x.example/',
    init: { headers: {} },
    signal: signal(),
    maxBytes: 100 * 1024,
  });
  assert.equal(response.status, 200);
  assert.ok(response.text.length <= 100 * 1024, 'the body is capped');
  assert.ok(state.cancelled, 'the rest of the body is never read');
  assert.ok(state.sent < 10, 'it stops reading at the cap');
}
await rejectsWith(
  fetchCapped({
    fetch: async () => {
      throw new TypeError(
        `connect failed for https://x.example/?key=${SECRET}`,
      );
    },
    url: 'https://x.example/',
    init: { headers: {} },
    signal: signal(),
    maxBytes: 100,
  }),
  'network_TypeError',
);
await rejectsWith(
  fetchCapped({
    fetch: hang,
    url: 'https://x.example/',
    init: { headers: {} },
    signal: signal(),
    maxBytes: 100,
    timeoutMs: 30,
  }),
  'timeout',
);

// DuckDuckGo: two requests, the second with the token
{
  const { fetch, calls } = ddgFetch([[row(1), row(2)]]);
  const results = await createDdgProvider().search('apple pie recipe', {
    fetch,
    signal: signal(),
  });
  assert.equal(calls.length, 2, 'one request for the token, one for pictures');
  assert.ok(new URL(calls[0].url).searchParams.get('q') === 'apple pie recipe');
  const images = new URL(calls[1].url).searchParams;
  assert.equal(images.get('vqd'), TOKEN, 'the token is sent back');
  assert.equal(images.get('q'), 'apple pie recipe');
  assert.equal(images.get('p'), '1', 'safe search is on');
  assert.deepEqual(results[0], {
    thumbUrl: 'https://tse.example.net/th?id=1',
    imageUrl: 'https://img.example.com/1.jpg',
    title: 'Pie 1',
    host: 'cooking.example.org',
  });
  assert.equal(results.length, 2);
}
await rejectsWith(
  createDdgProvider().search('pie', {
    fetch: ddgFetch([[row(1)]], 200, '<html>no token</html>').fetch,
    signal: signal(),
  }),
  'token_missing',
);
await rejectsWith(
  createDdgProvider().search('pie', {
    fetch: ddgFetch([[row(1)]], 403).fetch,
    signal: signal(),
  }),
  'http_403',
);
{
  const malformed = fakeFetch((url) =>
    url.pathname === '/i.js' ? text('{"results": [') : text(PAGE),
  );
  await rejectsWith(
    createDdgProvider().search('pie', {
      fetch: malformed.fetch,
      signal: signal(),
    }),
    'bad_json',
  );
  assert.equal(
    countImageCalls(malformed.calls),
    2,
    'tried twice, never three times',
  );
}
{
  const deep = fakeFetch((url) =>
    url.pathname === '/i.js' ? text('['.repeat(300_000)) : text(PAGE),
  );
  await rejectsWith(
    createDdgProvider().search('pie', { fetch: deep.fetch, signal: signal() }),
    'bad_json',
  );
}
{
  const { fetch, calls } = ddgFetch([[], [row(1)]]);
  const results = await createDdgProvider().search('pie', {
    fetch,
    signal: signal(),
  });
  assert.equal(results.length, 1, 'an empty first answer is tried once more');
  assert.equal(countImageCalls(calls), 2);
}
{
  const { fetch, calls } = ddgFetch([[]]);
  const results = await createDdgProvider().search('zzzz', {
    fetch,
    signal: signal(),
  });
  assert.deepEqual(results, [], 'empty twice is an honest empty answer');
  assert.equal(countImageCalls(calls), 2, 'one retry at most');
}
{
  const { fetch } = ddgFetch([
    [
      row(1, { image: 'http://x.example/a.jpg' }),
      row(2, { thumbnail: 'ftp://x.example/t' }),
      row(3),
    ],
  ]);
  const results = await createDdgProvider().search('pie', {
    fetch,
    signal: signal(),
  });
  assert.deepEqual(
    results.map((result) => result.title),
    ['Pie 3'],
    'non-https pictures are dropped',
  );
}
await rejectsWith(
  createDdgProvider().search('pie', {
    fetch: fakeFetch((url) =>
      url.pathname === '/i.js' ? text('blocked', 403) : text(PAGE),
    ).fetch,
    signal: signal(),
  }),
  'http_403',
);
await rejectsWith(
  createDdgProvider().search('pie', {
    fetch: hang,
    signal: signal(),
    requestTimeoutMs: 30,
  }),
  'timeout',
);
{
  const clock = { now: 1_000_000 };
  const provider = createDdgProvider(() => clock.now);
  const failing = fakeFetch(() => text('nope', 500));
  const context = { fetch: failing.fetch, signal: signal() };
  assert.equal(await provider.isAvailable(signal()), true);
  await provider.search('pie', context).catch(() => undefined);
  await provider.search('pie', context).catch(() => undefined);
  assert.equal(
    await provider.isAvailable(signal()),
    true,
    'two failures do not pause it',
  );
  await provider.search('pie', context).catch(() => undefined);
  assert.equal(
    await provider.isAvailable(signal()),
    false,
    'three in a row pause it',
  );
  clock.now += 5 * 60_000 + 1;
  assert.equal(
    await provider.isAvailable(signal()),
    true,
    'it comes back after five minutes',
  );

  const working = ddgFetch([[row(1)]]);
  await provider.search('pie', context).catch(() => undefined);
  await provider.search('pie', context).catch(() => undefined);
  await provider.search('pie', { fetch: working.fetch, signal: signal() });
  await provider.search('pie', context).catch(() => undefined);
  await provider.search('pie', context).catch(() => undefined);
  assert.equal(
    await provider.isAvailable(signal()),
    true,
    'a success clears the count of failures',
  );
}

// the secret reader: environment first, then Secret Manager, and never an error
{
  const reader = createOptionalSecretReader({
    fetch: async () => {
      throw new Error('no network');
    },
    env: { GOOGLE_CSE_KEY: `  ${SECRET} ` },
  });
  assert.equal(
    await reader('GOOGLE_CSE_KEY', signal()),
    SECRET,
    'env is trimmed',
  );
  assert.equal(
    await reader('GOOGLE_CSE_CX', signal()),
    null,
    'no network, no secret: null',
  );
}
{
  const { fetch, calls } = fakeFetch((url) => {
    if (url.hostname === 'metadata.google.internal')
      return json({ access_token: 'tok' });
    if (url.pathname.endsWith('/GOOGLE_CSE_KEY/versions/latest:access')) {
      return json({
        payload: { data: Buffer.from(`${SECRET}\n`).toString('base64') },
      });
    }
    return json({ error: 'not found' }, 404);
  });
  const clock = { now: 0 };
  const reader = createOptionalSecretReader({
    fetch,
    env: { GCLOUD_PROJECT: 'demo-project' },
    now: () => clock.now,
  });
  assert.equal(await reader('GOOGLE_CSE_KEY', signal()), SECRET);
  const afterFirst = calls.length;
  assert.equal(await reader('GOOGLE_CSE_KEY', signal()), SECRET);
  assert.equal(calls.length, afterFirst, 'a found secret is remembered');
  assert.ok(
    calls.some((call) =>
      call.url.includes('/projects/demo-project/secrets/GOOGLE_CSE_KEY/'),
    ),
  );
  assert.equal(
    await reader('GOOGLE_CSE_CX', signal()),
    null,
    'a secret that is not there is null',
  );
  const afterMissing = calls.length;
  assert.equal(await reader('GOOGLE_CSE_CX', signal()), null);
  assert.equal(
    calls.length,
    afterMissing,
    'not-there is remembered for a moment too',
  );
  clock.now += 2 * 60_000 + 1;
  await reader('GOOGLE_CSE_CX', signal());
  assert.ok(
    calls.length > afterMissing,
    'and looked for again after two minutes',
  );
}
{
  const { fetch, calls } = fakeFetch(() => json({}));
  const reader = createOptionalSecretReader({ fetch, env: {} });
  assert.equal(await reader('GOOGLE_CSE_KEY', signal()), null);
  assert.equal(calls.length, 0, 'with no project there is nothing to ask');
  const tooLong = createOptionalSecretReader({
    fetch,
    env: { GOOGLE_CSE_KEY: 'k'.repeat(600) },
  });
  assert.equal(
    await tooLong('GOOGLE_CSE_KEY', signal()),
    null,
    'an oversized value is not a key',
  );
}

// Google: picture results, safe search, and skipped when its secrets are absent
{
  const calls: string[] = [];
  const provider = createGoogleProvider(async () => null);
  assert.equal(
    await provider.isAvailable(signal()),
    false,
    'absent secrets: unavailable',
  );
  assert.deepEqual(
    provider.quota,
    { dailyCap: 90, timeZone: 'America/Los_Angeles' },
    "Google's 100 a day is counted by Pacific days and stopped ten short",
  );
  await rejectsWith(
    provider.search('soup', {
      fetch: async (url) => {
        calls.push(url);
        return json({});
      },
      signal: signal(),
    }),
    'not_configured',
  );
  assert.equal(calls.length, 0, 'and it never calls out');
  const half = createGoogleProvider(async (name) =>
    name === 'GOOGLE_CSE_KEY' ? SECRET : null,
  );
  assert.equal(
    await half.isAvailable(signal()),
    false,
    'a key without an engine id is not enough',
  );
}
{
  const { fetch, calls } = fakeFetch(() =>
    json({
      items: [
        gItem(1),
        gItem(2, { link: 'http://pics.example.com/2.jpg' }),
        gItem(3, {
          image: {
            contextLink: 'https://k.example',
            thumbnailLink: 'http://t.example/3',
          },
        }),
        gItem(4),
      ],
    }),
  );
  const provider = createGoogleProvider(async (name) =>
    name === 'GOOGLE_CSE_KEY' ? SECRET : 'engine-id',
  );
  assert.equal(await provider.isAvailable(signal()), true);
  const results = await provider.search('soup recipe', {
    fetch,
    signal: signal(),
  });
  const params = new URL(calls[0].url).searchParams;
  assert.equal(params.get('searchType'), 'image');
  assert.equal(params.get('num'), '6');
  assert.equal(params.get('safe'), 'active');
  assert.equal(params.get('key'), SECRET);
  assert.equal(params.get('cx'), 'engine-id');
  assert.equal(params.get('q'), 'soup recipe');
  assert.deepEqual(
    results.map((result) => result.title),
    ['Soup 1', 'Soup 4'],
    'non-https pictures and thumbnails are dropped',
  );
  assert.deepEqual(results[0], {
    thumbUrl: 'https://encrypted-tbn0.example.net/images?q=1',
    imageUrl: 'https://pics.example.com/1.jpg',
    title: 'Soup 1',
    host: 'kitchen.example.org',
  });
}
{
  const provider = createGoogleProvider(async () => SECRET);
  await rejectsWith(
    provider.search('soup', {
      fetch: async () =>
        json({ error: { message: `quota for key ${SECRET}` } }, 403),
      signal: signal(),
    }),
    'http_403',
  );
  await rejectsWith(
    provider.search('soup', {
      fetch: async () => text('<html>'),
      signal: signal(),
    }),
    'bad_json',
  );
  assert.deepEqual(
    await provider.search('soup', {
      fetch: async () => json({}),
      signal: signal(),
    }),
    [],
    'an answer with no items is an empty answer',
  );
  assert.deepEqual(
    await provider.search('soup', {
      fetch: async () => json({ items: 'x' }),
      signal: signal(),
    }),
    [],
  );
}

// the provider list is one switch
assert.deepEqual(parseProviderList(undefined), ['ddg', 'google']);
assert.deepEqual(parseProviderList(''), ['ddg', 'google']);
assert.deepEqual(parseProviderList('google'), ['google'], 'google alone');
assert.deepEqual(parseProviderList(' GOOGLE , ddg '), ['google', 'ddg']);
assert.deepEqual(
  parseProviderList('ddg,ddg,serper,google'),
  ['ddg', 'google'],
  'unknown names and repeats are dropped',
);
assert.deepEqual(
  parseProviderList('constructor,toString'),
  ['ddg', 'google'],
  'prototype names are not providers',
);
assert.deepEqual(
  parseProviderList('serper'),
  ['ddg', 'google'],
  'nothing usable falls back to the default',
);
assert.equal(DEFAULT_PROVIDER_LIST, 'ddg,google');

// queries
assert.equal(normalizeQuery('  apple   pie\n recipe '), 'apple pie recipe');
assert.equal(normalizeQuery(42), '');
assert.equal(normalizeQuery(null), '');
assert.equal(normalizeQuery('x'.repeat(200)).length, MAX_QUERY_LENGTH);
assert.equal(
  normalizeQuery(`${'a'.repeat(79)} b`),
  'a'.repeat(79),
  'a cut never leaves a trailing space',
);
assert.notEqual(
  getCacheId('pie', ['ddg', 'google']),
  getCacheId('pie', ['google']),
  'the provider list is part of the cache key',
);
assert.equal(
  getCacheId('Apple Pie', ['ddg']),
  getCacheId('apple pie', ['ddg']),
);

// the search: cache, order, quota, limit
const result = (n: number): ImageResult => ({
  thumbUrl: `https://t.example/${n}`,
  imageUrl: `https://i.example/${n}.jpg`,
  title: `Photo ${n}`,
  host: 'example.org',
});

interface Harness {
  deps: SearchDeps;
  cache: Map<string, CacheEntry>;
  searched: string[];
  reserved: string[];
  turns: { count: number };
  logs: string[];
  clock: { now: number };
}

type Behaviour = 'results' | 'empty' | 'fail' | 'unavailable';

const fakeProvider = (
  id: string,
  behaviour: Behaviour,
  searched: string[],
  withQuota = true,
): ImageProvider => ({
  id,
  quota: withQuota ? { dailyCap: 2, timeZone: 'UTC' } : null,
  isAvailable: async () => behaviour !== 'unavailable',
  search: async () => {
    searched.push(id);
    if (behaviour === 'fail') throw new ProviderFailure('http_500');
    return behaviour === 'results' ? [result(1), result(2)] : [];
  },
});

const harness = (
  behaviours: [string, Behaviour][],
  options: {
    exhausted?: string[];
    allowTurn?: boolean;
    withQuota?: boolean;
  } = {},
): Harness => {
  const cache = new Map<string, CacheEntry>();
  const searched: string[] = [];
  const reserved: string[] = [];
  const turns = { count: 0 };
  const logs: string[] = [];
  const clock = { now: 1_000_000 };
  const deps: SearchDeps = {
    providers: behaviours.map(([id, behaviour]) =>
      fakeProvider(id, behaviour, searched, options.withQuota ?? true),
    ),
    fetch: hang,
    now: () => clock.now,
    cache: {
      get: async (id) => cache.get(id) ?? null,
      set: async (id, entry) => {
        cache.set(id, entry);
      },
    },
    reserve: async (providerId) => {
      reserved.push(providerId);
      return !(options.exhausted ?? []).includes(providerId);
    },
    takeTurn: async () => {
      turns.count += 1;
      return options.allowTurn ?? true;
    },
    log: (message, detail) => logs.push(`${message} ${JSON.stringify(detail)}`),
  };
  return { deps, cache, searched, reserved, turns, logs, clock };
};

const refusedWith = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof ImageSearchError, `an ImageSearchError (${code})`);
  assert.equal((error as ImageSearchError).code, code);
};

{
  const h = harness([
    ['ddg', 'results'],
    ['google', 'results'],
  ]);
  const found = await searchImages('apple pie', h.deps);
  assert.equal(found.length, 2);
  assert.deepEqual(
    h.searched,
    ['ddg'],
    'the first provider with pictures wins',
  );
  assert.deepEqual(
    h.reserved,
    ['ddg'],
    'only the provider that was called is counted',
  );
}
{
  const h = harness([
    ['ddg', 'fail'],
    ['google', 'results'],
  ]);
  assert.equal((await searchImages('apple pie', h.deps)).length, 2);
  assert.deepEqual(
    h.searched,
    ['ddg', 'google'],
    'a failure falls through to the next provider',
  );
  assert.deepEqual(h.reserved, ['ddg', 'google']);
  assert.ok(
    h.logs[0].includes('"reason":"http_500"'),
    'the failure is logged by its short code',
  );
}
{
  const h = harness([
    ['ddg', 'empty'],
    ['google', 'results'],
  ]);
  assert.equal(
    (await searchImages('zzz', h.deps)).length,
    2,
    'an empty answer falls through too',
  );
  assert.deepEqual(h.searched, ['ddg', 'google']);
}
{
  const h = harness([
    ['google', 'results'],
    ['ddg', 'results'],
  ]);
  await searchImages('apple pie', h.deps);
  assert.deepEqual(
    h.searched,
    ['google'],
    'the order is the list order: google first when it is listed first',
  );
}
{
  const h = harness(
    [
      ['ddg', 'fail'],
      ['google', 'results'],
    ],
    { exhausted: ['google'] },
  );
  await refusedWith(searchImages('apple pie', h.deps), 'unavailable');
  assert.deepEqual(
    h.searched,
    ['ddg'],
    'a provider whose day is used up is never called (the budget stops Google)',
  );
  assert.equal(h.cache.size, 0, 'a refusal is never cached');
  assert.ok(h.logs.some((line) => line.includes('used up its day')));
}
{
  const h = harness(
    [
      ['ddg', 'results'],
      ['google', 'results'],
    ],
    { exhausted: ['ddg'] },
  );
  assert.equal((await searchImages('apple pie', h.deps)).length, 2);
  assert.deepEqual(
    h.searched,
    ['google'],
    'when the first provider is out of budget the next answers',
  );
}
{
  const h = harness([
    ['ddg', 'unavailable'],
    ['google', 'unavailable'],
  ]);
  await refusedWith(searchImages('apple pie', h.deps), 'unavailable');
  assert.deepEqual(
    h.reserved,
    [],
    'an unavailable provider is skipped without counting against its quota',
  );
  assert.deepEqual(h.searched, []);
}
{
  const h = harness([
    ['ddg', 'fail'],
    ['google', 'fail'],
  ]);
  await refusedWith(searchImages('apple pie', h.deps), 'unavailable');
  assert.equal(h.cache.size, 0, 'a failed answer is not cached');
  await refusedWith(searchImages('apple pie', h.deps), 'unavailable');
  assert.deepEqual(
    h.searched,
    ['ddg', 'google', 'ddg', 'google'],
    'so the next search tries again',
  );
}
{
  const h = harness([['ddg', 'results']]);
  await searchImages('Apple  Pie recipe', h.deps);
  const turns = h.turns.count;
  assert.equal((await searchImages(' apple pie RECIPE ', h.deps)).length, 2);
  assert.deepEqual(
    h.searched,
    ['ddg'],
    'a repeat of the same words is a cache hit',
  );
  assert.equal(
    h.turns.count,
    turns,
    "and a cache hit doesn't count against the person's limit",
  );
  assert.deepEqual(h.reserved, ['ddg'], 'or a provider quota');
  h.clock.now += RESULTS_TTL_MS + 1;
  await searchImages('apple pie recipe', h.deps);
  assert.deepEqual(
    h.searched,
    ['ddg', 'ddg'],
    'a week later it goes out again',
  );
}
{
  const h = harness([['ddg', 'empty']]);
  assert.deepEqual(await searchImages('zzz', h.deps), []);
  assert.equal(h.cache.size, 1, 'nothing found is kept, briefly');
  h.clock.now += EMPTY_TTL_MS - 1;
  await searchImages('zzz', h.deps);
  assert.deepEqual(
    h.searched,
    ['ddg'],
    'inside ten minutes it is not asked again',
  );
  h.clock.now += 2;
  await searchImages('zzz', h.deps);
  assert.deepEqual(
    h.searched,
    ['ddg', 'ddg'],
    'after ten minutes it is: an empty answer never sticks for the full time',
  );
}
{
  const h = harness([['ddg', 'results']], { allowTurn: false });
  await refusedWith(searchImages('apple pie', h.deps), 'rate_limited');
  assert.deepEqual(
    h.searched,
    [],
    'a person over their limit reaches no provider',
  );
}
{
  const h = harness([['ddg', 'results']]);
  h.deps.cache.get = async () => {
    throw new Error('cache read failed');
  };
  h.deps.cache.set = async () => {
    throw new Error('cache write failed');
  };
  assert.equal(
    (await searchImages('apple pie', h.deps)).length,
    2,
    'a broken cache never fails a search',
  );
}
{
  const a = harness([
    ['ddg', 'results'],
    ['google', 'results'],
  ]);
  const b = harness([['google', 'results']]);
  const shared = new Map<string, CacheEntry>();
  a.deps.cache = {
    get: async (id) => shared.get(id) ?? null,
    set: async (id, entry) => void shared.set(id, entry),
  };
  b.deps.cache = a.deps.cache;
  await searchImages('apple pie', a.deps);
  await searchImages('apple pie', b.deps);
  assert.deepEqual(
    b.searched,
    ['google'],
    'switching the provider list does not serve the old list from the cache',
  );
}
{
  const slow: ImageProvider = {
    id: 'slow',
    quota: null,
    isAvailable: async () => true,
    search: (_query, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () =>
          reject(new ProviderFailure('timeout')),
        );
      }),
  };
  const h = harness([]);
  h.deps.providers = [slow];
  h.deps.timeouts = { searchMs: 30, requestMs: 30 };
  const started = Date.now();
  await refusedWith(searchImages('apple pie', h.deps), 'unavailable');
  assert.ok(Date.now() - started < 1000, 'the search gives up at its deadline');
}
{
  const failingGoogle = createGoogleProvider(async () => SECRET);
  const h = harness([['ddg', 'fail']]);
  h.deps.providers = [...h.deps.providers, failingGoogle];
  h.deps.fetch = async () => json({ error: `bad key ${SECRET}` }, 403);
  const error = await searchImages('apple pie', h.deps).catch(
    (caught: unknown) => caught,
  );
  const seen = [...h.logs, JSON.stringify(error), String(error)].join('\n');
  assert.ok(!seen.includes(SECRET), 'a key is in no log and no error');
  assert.ok(!seen.includes('googleapis'), 'neither is an upstream address');
  assert.ok(!seen.includes('duckduckgo'));
}

// the per-person limit and the daily budget
{
  const now = 5_000_000;
  const day = '2026-10-18';
  const first = stepPersonUsage(null, now, day);
  assert.equal(first.allowed, true);
  const steps = Array.from({ length: PERSON_PER_WINDOW }).reduce<{
    state: PersonUsage | null;
    allowed: boolean[];
  }>(
    (acc) => {
      const step = stepPersonUsage(acc.state, now + 1000, day);
      return { state: step.next, allowed: [...acc.allowed, step.allowed] };
    },
    { state: first.next, allowed: [] },
  );
  assert.equal(
    steps.allowed.filter(Boolean).length,
    PERSON_PER_WINDOW - 1,
    `${PERSON_PER_WINDOW} searches a minute, then no more`,
  );
  const refused = stepPersonUsage(steps.state, now + 2000, day);
  assert.equal(refused.allowed, false);
  assert.deepEqual(
    refused.next,
    steps.state,
    'a refused search is not counted',
  );
  const later = stepPersonUsage(steps.state, now + PERSON_WINDOW_MS + 1, day);
  assert.equal(later.allowed, true, 'a new minute opens the window again');
  assert.equal(later.next.windowCount, 1);
  const spent: PersonUsage = {
    windowStart: now,
    windowCount: 0,
    day,
    dayCount: PERSON_PER_DAY,
  };
  assert.equal(
    stepPersonUsage(spent, now + 10 * PERSON_WINDOW_MS, day).allowed,
    false,
    'a day has a cap',
  );
  assert.equal(
    stepPersonUsage(spent, now + 10 * PERSON_WINDOW_MS, '2026-10-19').allowed,
    true,
    'and the next day starts again',
  );
}
assert.deepEqual(stepBudget(0, 90), { allowed: true, next: 1 });
assert.deepEqual(stepBudget(89, 90), { allowed: true, next: 90 });
assert.deepEqual(
  stepBudget(90, 90),
  { allowed: false, next: 90 },
  'the 91st call is refused',
);
assert.deepEqual(
  stepBudget(0, 0),
  { allowed: false, next: 0 },
  'a cap of zero turns a provider off',
);
assert.equal(readCap('50', 90), 50);
assert.equal(readCap('0', 90), 0);
assert.equal(readCap('-1', 90), 90);
assert.equal(readCap('abc', 90), 90);
assert.equal(readCap('', 90), 90);
assert.equal(readCap(undefined, 90), 90);
assert.equal(readCap('1.5', 90), 90);
{
  const instant = Date.UTC(2026, 9, 18, 3, 0);
  assert.equal(getQuotaDay(instant, 'UTC'), '2026-10-18');
  assert.equal(
    getQuotaDay(instant, 'America/Los_Angeles'),
    '2026-10-17',
    "Google's day is the Pacific one, so 03:00 UTC is still yesterday",
  );
  assert.equal(
    getQuotaDay(Date.UTC(2026, 9, 18, 7, 0), 'America/Los_Angeles'),
    '2026-10-18',
  );
}

console.log('image search checks passed');
