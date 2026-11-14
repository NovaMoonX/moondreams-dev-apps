import { readFileSync } from 'node:fs';
import { minimatch } from 'minimatch';

// A missing build file answered with the page (200, text/html) is stored by the edge and the browser under the
// file's name, and a screen can't load until that copy expires. This holds the hosting rewrite and the worker to a
// real 404 kept nowhere, hashed files kept for good, and the page and service worker re-checked on every load.
// With --live <origin> it asks the deployed site the same questions.

const failures: string[] = [];
const expect = (isTrue: boolean, message: string) => {
  if (!isTrue) failures.push(message);
};

type Rewrite = { source?: string; regex?: string; destination?: string };
const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting as { rewrites?: Rewrite[] };
const isRewritten = (path: string) =>
  (hosting.rewrites ?? []).some(({ source, regex }) =>
    source ? minimatch(path, source, { dot: true }) : regex ? new RegExp(regex).test(path) : false,
  );
expect(!isRewritten('/assets/RunwayPage-abc123.js'), 'firebase.json sends a missing /assets/ file to the page');
expect(!isRewritten('/assets/index-abc123.css'), 'firebase.json sends a missing /assets/ stylesheet to the page');
expect(isRewritten('/runway'), 'firebase.json no longer sends app paths to the page');
expect(isRewritten('/runway/plan/abc'), 'firebase.json no longer sends deep app paths to the page');

type Script = (url: URL, init?: RequestInit) => Response;
const respond = (body: string, type: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'max-age=3600' } });

const checkWorker = async () => {
  const state: { script: Script } = { script: () => respond('', 'text/plain') };
  Object.assign(globalThis, {
    HTMLRewriter: class {},
    fetch: async (request: Request, init?: RequestInit) => state.script(new URL(request.url), init),
  });
  const worker = (await import('../../cloudflare-worker.js')).default as {
    fetch: (request: Request) => Promise<Response>;
  };
  const run = async (path: string, script: Script) => {
    state.script = script;
    return worker.fetch(new Request(`https://apps.example${path}`, { headers: { 'user-agent': 'Chrome' } }));
  };

  const file = await run('/assets/a-1.js', () => respond('js', 'text/javascript'));
  expect(file.status === 200, 'worker: a build file is not served');
  expect(/immutable/.test(file.headers.get('cache-control') ?? ''), 'worker: a build file is not kept as immutable');

  const stored = await run('/assets/a-2.js', (_url, init) =>
    init?.cache === 'no-store' ? respond('js', 'text/javascript') : respond('<html>', 'text/html'),
  );
  expect(stored.status === 200, 'worker: a page the edge stored under a file name is not fetched past');

  const missing = await run('/assets/gone-3.js', () => respond('<html>', 'text/html'));
  expect(missing.status === 404, 'worker: a missing build file is not a 404');
  expect(missing.headers.get('cache-control') === 'no-store', 'worker: a missing build file may be cached');

  const revalidated = await run('/assets/a-4.js', () => new Response(null, { status: 304 }));
  expect(revalidated.status === 304, 'worker: a revalidated build file (304) is not passed through');

  const serverError = await run('/assets/a-5.js', () => respond('down', 'text/plain', 503));
  expect(serverError.status === 503, 'worker: a server error on a build file is hidden');

  const page = await run('/runway', () => respond('<html>', 'text/html'));
  expect(page.headers.get('cache-control') === 'no-cache', 'worker: the page may be kept without re-checking');

  const serviceWorker = await run('/sw.js', () => respond('sw', 'text/javascript'));
  expect(serviceWorker.headers.get('cache-control') === 'no-cache', 'worker: sw.js may be kept without re-checking');
};

const checkLive = async (origin: string) => {
  const missing = await fetch(`${origin}/assets/serving-check-missing-${Date.now()}.js`);
  expect(missing.status === 404, `live: a missing build file answers ${missing.status}, not 404`);
  expect(
    !(missing.headers.get('content-type') ?? '').includes('text/html'),
    'live: a missing build file is answered with the page',
  );
  expect(
    /no-store/.test(missing.headers.get('cache-control') ?? ''),
    `live: a missing build file is cached (${missing.headers.get('cache-control')})`,
  );

  const page = await fetch(`${origin}/runway`);
  expect(
    /no-cache/.test(page.headers.get('cache-control') ?? ''),
    `live: the page is kept without re-checking (${page.headers.get('cache-control')})`,
  );
  const sw = await fetch(`${origin}/sw.js`);
  expect(
    /no-cache/.test(sw.headers.get('cache-control') ?? ''),
    `live: sw.js is kept without re-checking (${sw.headers.get('cache-control')})`,
  );

  const entry = (await page.text()).match(/\/assets\/index-[\w-]+\.js/)?.[0];
  expect(Boolean(entry), 'live: the page names no entry file');
  if (entry) {
    const file = await fetch(`${origin}${entry}`);
    expect(file.status === 200, `live: the entry file answers ${file.status}`);
    expect(/javascript/.test(file.headers.get('content-type') ?? ''), 'live: the entry file is not JavaScript');
  }
};

const liveIndex = process.argv.indexOf('--live');
await (liveIndex >= 0 ? checkLive(process.argv[liveIndex + 1]) : checkWorker());

if (failures.length > 0) {
  console.error(failures.map((failure) => `✗ ${failure}`).join('\n'));
  process.exit(1);
}
console.log(liveIndex >= 0 ? 'Live serving OK.' : 'Serving rules OK: missing files are 404s kept nowhere.');
