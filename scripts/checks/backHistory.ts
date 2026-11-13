import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

// A door in a sheet (`afterBackLayersClose`) lands where it points, inside the app, in a stand-in app on the real hook (not Runway or its URL library) after Back, a reload and an update's restart; it needs Playwright's Chromium, which cloud sessions have.
interface Page {
  goto: (url: string) => Promise<unknown>;
  reload: () => Promise<unknown>;
  goBack: () => Promise<unknown>;
  keyboard: { press: (key: string) => Promise<void> };
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
const escape: Step = async (page) => {
  await page.keyboard.press('Escape');
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
// A closed add form leaves no entry behind: one Back from the tab leaves it.
const runAddForm = async (cpuRate: number) => {
  const page = await browser.newPage();
  if (cpuRate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
  await page.goto(`${origin}/home`);
  await tap('Enter app')(page);
  await tap('Open add')(page);
  await tap('Close add')(page);
  await back(page);
  const landed = new URL(page.url());
  const label = `add form closed, then Back${cpuRate > 1 ? ` (CPU ×${cpuRate})` : ''}`;
  const isRight = landed.pathname === '/home';
  if (!isRight)
    failures.push(`${label}: stayed on ${landed.pathname}${landed.search}`);
  console.log(
    `${isRight ? 'ok  ' : 'FAIL'} ${label} → ${landed.pathname}${landed.search}`,
  );
};
await [1, 6].reduce(
  (done, cpuRate) => done.then(() => runAddForm(cpuRate)),
  Promise.resolve(),
);

// Asking about a page: the conversation opens over it with one entry of its own, and each way out lands where the person was.
interface Landing {
  path: string;
  hasAsk: boolean;
  hasView: boolean;
  text: string;
  scrollY: number;
}
const read = (page: Page) =>
  page.evaluate(() => ({
    path: window.location.pathname,
    hasAsk: new URLSearchParams(window.location.search).has('ask'),
    hasView: new URLSearchParams(window.location.search).has('view'),
    text: document.body.innerText,
    scrollY: window.scrollY,
  }));
const scrolled: Step = async (page) => {
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(200);
};
const askJourneys: {
  name: string;
  steps: Step[];
  isRight: (landing: Landing) => boolean;
}[] = [
  {
    name: 'ask from a scrolled page, Back',
    steps: [scrolled, tap('Ask page'), back],
    isRight: ({ path, hasAsk, text, scrollY }) =>
      path === '/helm' &&
      !hasAsk &&
      text.includes('Today page') &&
      !text.includes('Ask open') &&
      scrollY >= 590,
  },
  {
    name: 'ask from a sheet, Back lands on the sheet',
    steps: [tap('Open record sheet'), tap('Ask this one'), back],
    isRight: ({ path, hasAsk, text }) =>
      path === '/helm' &&
      !hasAsk &&
      text.includes('Sheet of one record') &&
      !text.includes('Ask open'),
  },
  {
    name: 'ask from a sheet, Escape closes only the ask',
    steps: [tap('Open record sheet'), tap('Ask this one'), escape],
    isRight: ({ path, hasAsk, text }) =>
      path === '/helm' &&
      !hasAsk &&
      text.includes('Sheet of one record') &&
      !text.includes('Ask open'),
  },
  {
    name: 'ask from a sheet, Back twice closes the sheet',
    steps: [tap('Open record sheet'), tap('Ask this one'), back, back],
    isRight: ({ path, hasAsk, text }) =>
      path === '/helm' && !hasAsk && !text.includes('Sheet of one record'),
  },
  {
    name: 'ask, a reply link to a record, Back to the first page',
    steps: [tap('Ask page'), tap('Follow link'), back],
    isRight: ({ path, hasAsk, hasView, text }) =>
      path === '/helm' &&
      !hasAsk &&
      !hasView &&
      text.includes('Today page') &&
      !text.includes('Ask open'),
  },
  {
    name: 'sheet, ask, a reply link to a record, Back to the page',
    steps: [
      tap('Open record sheet'),
      tap('Ask this one'),
      tap('Follow link'),
      back,
    ],
    isRight: ({ path, hasAsk, hasView, text }) =>
      path === '/helm' &&
      !hasAsk &&
      !hasView &&
      text.includes('Today page') &&
      !text.includes('Sheet of one record'),
  },
  {
    name: 'reload with ask open, Back to the page',
    steps: [tap('Ask page'), reload, back],
    isRight: ({ path, hasAsk, text }) =>
      path === '/helm' &&
      !hasAsk &&
      text.includes('Today page') &&
      !text.includes('Ask open'),
  },
  {
    name: 'ask closed by its control leaves no entry',
    steps: [tap('Ask page'), tap('Close ask'), back],
    isRight: ({ path }) => path === '/home',
  },
];
const runAsk = async (
  { name, steps, isRight }: (typeof askJourneys)[number],
  cpuRate: number,
) => {
  const page = await browser.newPage();
  if (cpuRate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
  await page.goto(`${origin}/home`);
  await tap('Enter ask page')(page);
  await steps.reduce(
    (done, step) => done.then(() => step(page)),
    Promise.resolve(),
  );
  const landing = await read(page);
  const label = `${name}${cpuRate > 1 ? ` (CPU ×${cpuRate})` : ''}`;
  const result = isRight(landing);
  if (!result)
    failures.push(`${label}: ${JSON.stringify({ ...landing, text: '' })}`);
  console.log(`${result ? 'ok  ' : 'FAIL'} ${label} → ${landing.path}`);
};
await [1, 6].reduce(
  (done, cpuRate) =>
    askJourneys.reduce(
      (inner, journey) => inner.then(() => runAsk(journey, cpuRate)),
      done,
    ),
  Promise.resolve(),
);

// A step mark counts only in the load that wrote it: after a reload (or a phone restoring the page) Back must not pop onto the old page.
const runStepMark = async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/home`);
  const isStep = () =>
    page.evaluate(() =>
      (
        window as unknown as { isHistoryStep: (flag: string) => boolean }
      ).isHistoryStep('tabStep'),
    );
  await page.evaluate(() =>
    (
      window as unknown as { markHistoryStep: (flag: string) => void }
    ).markHistoryStep('tabStep'),
  );
  const isSameLoad = await isStep();
  await page.reload();
  const isAfterReload = await isStep();
  await page.evaluate(() => {
    const oldMark = { tabStep: true };
    window.history.replaceState({ ...window.history.state, ...oldMark }, '');
  });
  const isOldTrue = await isStep();
  const isRight = isSameLoad && !isAfterReload && !isOldTrue;
  const label = 'step mark: same load, after a reload, an old `true` mark';
  if (!isRight)
    failures.push(
      `${label}: ${isSameLoad}, ${isAfterReload}, ${isOldTrue} (want true, false, false)`,
    );
  console.log(
    `${isRight ? 'ok  ' : 'FAIL'} ${label} → ${isSameLoad}, ${isAfterReload}, ${isOldTrue}`,
  );
};
await runStepMark();
await browser.close();
server.close();
assert.deepEqual(
  failures,
  [],
  `A door left the app, missed its target or lost the page:\n${failures.join('\n')}`,
);
console.log(
  'back-history: every door landed on its target, and a closed form left no entry',
);
