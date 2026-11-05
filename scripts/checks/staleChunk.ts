import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A page left open across a deploy opens a screen whose file the deploy removed: it reloads once into the new version, and a second miss inside half a minute shows the error screen instead of looping. Two real builds, served the way Hosting serves them; it needs Playwright's Chromium.
interface Page {
  goto: (url: string) => Promise<unknown>;
  goBack: () => Promise<unknown>;
  goForward: () => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  waitForFunction: (
    fn: (arg: string) => boolean,
    arg: string,
    options: { timeout: number },
  ) => Promise<unknown>;
  evaluate: <T, A = undefined>(fn: (arg: A) => T, arg?: A) => Promise<T>;
}
interface Context {
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

const root = await mkdtemp(path.join(tmpdir(), 'stale-chunk-'));
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
      env: { ...process.env, SITE_VERSION: `check-${name}` },
    },
  );
  return outDir;
};
// Removes the builds when a build itself fails, since the cleanup below is never reached.
const buildOrClean = (name: string) => {
  try {
    return buildInto(name);
  } catch (error) {
    execFileSync('rm', ['-rf', root]);
    throw error;
  }
};
const before = buildOrClean('before');
const after = buildOrClean('after');
const newScript = (
  await readFile(path.join(after, 'index.html'), 'utf8')
).match(/assets\/index-[^"]+\.js/)?.[0];
assert.ok(newScript, 'The second build has no entry script');
const runwayChunk = (dir: string) =>
  readdir(path.join(dir, 'assets')).then((names) =>
    names.find((name) => /^RunwayPage-.*\.js$/.test(name)),
  );
const oldRunway = await runwayChunk(before);
assert.ok(
  oldRunway !== undefined && oldRunway !== (await runwayChunk(after)),
  "The second build kept the first build's Runway file, so nothing would be missing",
);

const types: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
let served = before;
// Like Hosting's rewrite of every path to the page: a removed file comes back as HTML.
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://local').pathname;
  readFile(path.join(served, pathname))
    .then((body) => {
      response.writeHead(200, {
        'content-type':
          types[path.extname(pathname)] ?? 'application/octet-stream',
      });
      response.end(body);
    })
    .catch(() =>
      readFile(path.join(served, 'index.html')).then((body) => {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(body);
      }),
    );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

interface Landing {
  pathname: string;
  isOldPage: boolean;
  script: string;
  text: string;
  stamp: string | null;
  presetStamp: string;
}

const browser = await chromium.launch();
const openAfterDeploy = async (isRetry: boolean) => {
  served = before;
  // A worker would serve the old files from its cache and hide the miss.
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(`${origin}/`);
  // The old build has to be running before the deploy; a page that never booted proves nothing.
  await page.waitForFunction(
    () =>
      (document.getElementById('root')?.childElementCount ?? 0) > 0 &&
      !document.body.innerText.includes('something went wrong'),
    '',
    { timeout: 20000 },
  );
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as { isOldPage: boolean }).isOldPage = true;
  });
  const presetStamp = String(Date.now());
  if (isRetry) {
    await page.evaluate(
      (stamp) => window.sessionStorage.setItem('staleChunkReloadAt', stamp),
      presetStamp,
    );
  }
  served = after;
  // Back then Forward onto a screen this page never loaded, so the router asks for its file now.
  await page.evaluate(() =>
    window.history.pushState(
      { idx: 1, key: 'stale', usr: null },
      '',
      '/runway',
    ),
  );
  await page.goBack();
  await page.waitForTimeout(500);
  await page.goForward();
  // Settled once the new build runs, or the old page shows its error screen.
  await page.waitForFunction(
    (script) =>
      document
        .querySelector<HTMLScriptElement>('script[type=module]')
        ?.src.endsWith(script) === true ||
      document.body.innerText.includes('something went wrong'),
    newScript,
    { timeout: 20000 },
  );
  await page.waitForTimeout(1500);
  const landing = await page.evaluate(() => ({
    pathname: window.location.pathname,
    isOldPage: Boolean(
      (window as unknown as { isOldPage?: boolean }).isOldPage,
    ),
    script:
      document.querySelector<HTMLScriptElement>('script[type=module]')?.src ??
      '',
    text: document.body.innerText,
    stamp: window.sessionStorage.getItem('staleChunkReloadAt'),
  }));
  await context.close();
  return { ...landing, presetStamp } as Landing;
};

const failures: string[] = [];
const report = (label: string, isRight: boolean, landing: Landing) => {
  if (!isRight) {
    failures.push(
      `${label}: on ${landing.pathname}, ${landing.isOldPage ? 'old page' : 'reloaded'}, showing "${landing.text.slice(0, 80).replace(/\s+/g, ' ')}"`,
    );
  }
  console.log(`${isRight ? 'ok  ' : 'FAIL'} ${label}`);
};

const runBoth = async () => {
  try {
    const fresh = await openAfterDeploy(false);
    const retry = await openAfterDeploy(true);
    return { fresh, retry };
  } finally {
    await browser.close();
    server.close();
    await rm(root, { recursive: true, force: true });
  }
};
const { fresh, retry } = await runBoth();
report(
  'a deploy, then a screen not yet loaded: reloads into the new version on that screen',
  fresh.pathname === '/runway' &&
    !fresh.isOldPage &&
    fresh.script.endsWith(newScript) &&
    !fresh.text.includes('something went wrong') &&
    fresh.stamp !== null,
  fresh,
);
report(
  'a second miss within half a minute: the error screen with Restart, no reload',
  retry.isOldPage &&
    retry.text.includes('something went wrong') &&
    retry.text.includes('Restart') &&
    retry.stamp === retry.presetStamp,
  retry,
);

assert.deepEqual(
  failures,
  [],
  `A page left open across a deploy mishandled a missing file:\n${failures.join('\n')}`,
);
console.log(
  'stale-chunk: a deploy reloads once into the new version, then stops',
);
