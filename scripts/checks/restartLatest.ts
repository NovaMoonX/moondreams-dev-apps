import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Several deploys land in a row: the strip's one Restart tap must load the newest build, not the one the worker took over with. Three real builds (1.0.0 to 1.0.2) served the way Hosting serves them, the worker taking over as the trigger, in a page that reports itself installed (a tab is only told of a worker that waits, and this one never does); it needs Playwright's Chromium.
interface Page {
  goto: (url: string) => Promise<unknown>;
  click: (selector: string, options: { timeout: number }) => Promise<void>;
  on: (
    event: 'console',
    handler: (message: { text: () => string }) => void,
  ) => void;
  waitForFunction: (
    fn: () => boolean,
    arg: undefined,
    options: { timeout: number },
  ) => Promise<unknown>;
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
}
interface Context {
  addInitScript: (script: () => void) => Promise<void>;
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as {
  chromium: {
    launch: () => Promise<{
      newContext: (options: object) => Promise<Context>;
      close: () => Promise<void>;
    }>;
  };
};

// The same stand-in Firebase settings wherever it runs, so a session's own keys never decide whether the app boots; emulator mode keeps it off the real project.
const buildEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')),
  ),
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_FIREBASE_API_KEY: 'check-api-key',
  VITE_FIREBASE_AUTH_DOMAIN_CUSTOM: 'localhost',
  VITE_FIREBASE_PROJECT_ID: 'demo-restart-latest',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-restart-latest.appspot.com',
  VITE_FIREBASE_DATABASE_URL: 'http://localhost:9000?ns=demo-restart-latest',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: '1:0:web:0',
};
const root = await mkdtemp(path.join(tmpdir(), 'restart-latest-'));
// Three production builds are large; they go however the check ends, a failed assert or build included.
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
const buildInto = (name: string) => {
  const outDir = path.join(root, name);
  execFileSync(
    'npx',
    [
      'vite',
      'build',
      '--outDir',
      outDir,
      '--emptyOutDir',
      '--logLevel',
      'error',
    ],
    {
      stdio: 'inherit',
      env: { ...buildEnv, SITE_VERSION: name },
    },
  );
  return outDir;
};
const builds = {
  '1.0.0': buildInto('1.0.0'),
  '1.0.1': buildInto('1.0.1'),
  '1.0.2': buildInto('1.0.2'),
};

const types: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
let served = builds['1.0.0'];
// Like Hosting: a missing build file is a 404, any other path is the page; the worker's script is never cached.
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://local').pathname;
  readFile(path.join(served, pathname))
    .then((body) => {
      response.writeHead(200, {
        'content-type':
          types[path.extname(pathname)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      response.end(body);
    })
    .catch(() => {
      if (pathname.startsWith('/assets/')) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return undefined;
      }
      return readFile(path.join(served, 'index.html')).then((body) => {
        response.writeHead(200, {
          'content-type': 'text/html',
          'cache-control': 'no-cache',
        });
        response.end(body);
      });
    });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

const browser = await chromium.launch();
const run = async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  // An installed app is where the page learns a worker took over (a tab's registration only prompts for one that waits, and this worker never waits).
  await context.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes('display-mode: standalone')
        ? ({ ...real('all'), matches: true, media: query } as MediaQueryList)
        : real(query);
  });
  const page = await context.newPage();
  const logged: string[] = [];
  page.on('console', (message) => logged.push(message.text()));
  const hasLogged = (version: string) =>
    logged.some((line) => line.includes(`MoonDreams Dev Apps v${version}`));
  await page.goto(`${origin}/`);
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => (document.getElementById('root')?.childElementCount ?? 0) > 0,
    undefined,
    { timeout: 20000 },
  );
  assert.ok(
    hasLogged('1.0.0'),
    `The first page did not run 1.0.0: ${logged.join(' | ')}`,
  );

  // Deploy 1.0.1: the worker installs and takes over, which raises the strip.
  served = builds['1.0.1'];
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('New version ready'),
    undefined,
    { timeout: 30000 },
  );

  // Deploy 1.0.2 lands before the person taps.
  served = builds['1.0.2'];
  logged.length = 0;
  await page.click('button:has-text("Restart")', { timeout: 5000 });
  const deadline = Date.now() + 40000;
  while (!hasLogged('1.0.2') && !hasLogged('1.0.1') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const stripShown = await page.evaluate(() =>
    document.body.innerText.includes('New version ready'),
  );
  await context.close();
  return { logged, stripShown, hasLogged102: hasLogged('1.0.2') };
};

const result = await run().finally(async () => {
  await browser.close();
  server.close();
});
console.log(
  `${result.hasLogged102 ? 'ok  ' : 'FAIL'} one Restart tap lands on 1.0.2`,
);
assert.ok(
  result.hasLogged102,
  `One Restart tap did not load the newest build; the page logged: ${result.logged.join(' | ')}`,
);
console.log(
  'restart-latest: one tap on Restart loads the newest build after several deploys',
);
