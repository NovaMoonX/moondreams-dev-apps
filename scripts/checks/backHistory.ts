import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

// A door in a sheet (`afterBackLayersClose`) lands where it points, inside the app, in a stand-in app on the real hook (not Runway or its URL library) after Back, a reload and an update's restart; it needs Playwright's Chromium, which cloud sessions have.
interface Page {
  goto: (url: string) => Promise<unknown>;
  reload: () => Promise<unknown>;
  goBack: () => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  url: () => string;
  evaluate: <T>(fn: () => T) => Promise<T>;
  getByRole: (
    role: string,
    options: { name: string },
  ) => { click: () => Promise<void> };
  context: () => {
    newCDPSession: (page: Page) => Promise<{
      send: (method: string, params: object) => Promise<unknown>;
    }>;
  };
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as {
  chromium: {
    launch: () => Promise<{
      newPage: () => Promise<Page>;
      close: () => Promise<void>;
    }>;
  };
};

const bundle = await build({
  entryPoints: ['scripts/checks/backHistory/harness.tsx'],
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  tsconfig: 'tsconfig.app.json',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'error',
});
const script = bundle.outputFiles[0].text;
const html = `<!doctype html><html><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`;
const server = createServer((request, response) => {
  const isScript = request.url === '/harness.js';
  response.writeHead(200, {
    'content-type': isScript ? 'text/javascript' : 'text/html',
  });
  response.end(isScript ? script : html);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

type Step = (page: Page) => Promise<void>;
const tap =
  (name: string): Step =>
  async (page) => {
    await page.getByRole('button', { name }).click();
    await page.waitForTimeout(400);
  };
const back: Step = async (page) => {
  await page.goBack();
  await page.waitForTimeout(600);
};
// An update's restart reloads the page with entries a long session left: kept markers written by an earlier load on the app's own entries.
const restartAfterLongSession: Step = async (page) => {
  await page.evaluate(() => {
    const old = { keptFor: 'sheet', keptLoad: 'an-earlier-load' };
    window.history.replaceState({ ...window.history.state, ...old }, '');
    window.history.pushState({ ...window.history.state, ...old }, '');
  });
  await page.reload();
  await page.waitForTimeout(600);
};
const reload: Step = async (page) => {
  await page.reload();
  await page.waitForTimeout(600);
};

const journeys: Record<string, Step[]> = {
  plain: [],
  'day, then Back': [tap('Open day'), back],
  'day, reload, Back': [tap('Open day'), reload, back],
  'sheet reopened': [tap('Close sheet'), tap('Open sheet')],
};
const beforeSheet: Record<string, Step[]> = {
  'restart after a long session': [restartAfterLongSession],
};

const browser = await chromium.launch();
const failures: string[] = [];
const run = async (
  name: string,
  before: Step[],
  steps: Step[],
  cpuRate: number,
) => {
  const page = await browser.newPage();
  (
    page as unknown as {
      on: (event: string, handler: (error: Error) => void) => void;
    }
  ).on('pageerror', (error) =>
    failures.push(`${name}: page error ${error.message}`),
  );
  if (cpuRate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
  await page.goto(`${origin}/home`);
  await tap('Enter app')(page);
  await before.reduce(
    (done, step) => done.then(() => step(page)),
    Promise.resolve(),
  );
  await tap('Open sheet')(page);
  await steps.reduce(
    (done, step) => done.then(() => step(page)),
    Promise.resolve(),
  );
  await tap('Door')(page);
  await page.waitForTimeout(2000);
  const landed = new URL(page.url());
  const label = `${name}${cpuRate > 1 ? ` (CPU ×${cpuRate})` : ''}`;
  const isRight =
    landed.pathname === '/app' &&
    landed.searchParams.get('target') === '1' &&
    !landed.searchParams.has('sheet') &&
    !landed.searchParams.has('day');
  if (!isRight)
    failures.push(`${label}: landed on ${landed.pathname}${landed.search}`);
  console.log(
    `${isRight ? 'ok  ' : 'FAIL'} ${label} → ${landed.pathname}${landed.search}`,
  );
};

const cases = [
  ...Object.entries(journeys).map(([name, steps]) => ({
    name,
    before: [] as Step[],
    steps,
  })),
  ...Object.entries(beforeSheet).map(([name, before]) => ({
    name,
    before,
    steps: [] as Step[],
  })),
];
await [1, 6].reduce(
  (done, cpuRate) =>
    cases.reduce(
      (inner, { name, before, steps }) =>
        inner.then(() => run(name, before, steps, cpuRate)),
      done,
    ),
  Promise.resolve(),
);
await browser.close();
server.close();
assert.deepEqual(
  failures,
  [],
  `A door left the app or missed its target:\n${failures.join('\n')}`,
);
console.log('back-history: every door landed on its target');
