import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { APP_REGISTRY } from '../src/lib/app/app.registry';

/** Renders `public/banners/by-app/banner-<id>.png` (2560x1440, the link preview's picture) from the app's logo, name and primary colour. */

const args = process.argv.slice(2);
const appId = args[0];
const isForced = args.includes('--force');
const colorArg = args[args.indexOf('--color') + 1];
const app = APP_REGISTRY.find((entry) => entry.id === appId);
if (!app) {
  console.error(`Usage: npm run make:banner -- <app id> [--color #rrggbb] [--force]\nApp ids: ${APP_REGISTRY.map((entry) => entry.id).join(', ')}`);
  process.exit(1);
}

const logoPath = `public/logos/by-app/logo-${app.id}.svg`;
const bannerPath = `public/banners/by-app/banner-${app.id}.png`;
if (!existsSync(logoPath)) {
  console.error(`${logoPath} is missing: commit the app's logo (a light glyph on black, 1024x1024) first.`);
  process.exit(1);
}
if (existsSync(bannerPath) && !isForced) {
  console.error(`${bannerPath} already exists; pass --force to replace it.`);
  process.exit(1);
}

const themePath = `src/apps/${app.id}/${app.id}.css`;
const themePrimary = (existsSync(themePath) ? readFileSync(themePath, 'utf8') : '').match(
  /--color-primary:\s*(#[0-9a-f]{6})\b/i,
)?.[1];
const primary = args.includes('--color') ? colorArg : themePrimary;
if (args.includes('--color') && !/^#[0-9a-f]{6}$/i.test(colorArg ?? '')) {
  console.error(`--color needs a six-digit hex value, like: npm run make:banner -- ${app.id} --color #1a2b3c`);
  process.exit(1);
}
if (!primary || !/^#[0-9a-f]{6}$/i.test(primary)) {
  console.error(
    `No #rrggbb --color-primary in ${themePath} (light theme); pass the app's main colour: npm run make:banner -- ${app.id} --color #rrggbb`,
  );
  process.exit(1);
}
const darker = `#${[1, 3, 5]
  .map((at) => Math.round(parseInt(primary.slice(at, at + 2), 16) * 0.55).toString(16).padStart(2, '0'))
  .join('')}`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const logo = `data:image/svg+xml;base64,${readFileSync(logoPath).toString('base64')}`;
// `screen` drops the logo's black square onto the gradient and keeps its light glyph.
const html = `<!doctype html><html><head><style>
html,body{margin:0;width:2560px;height:1440px}
body{background:linear-gradient(160deg,${darker} 0%,${primary} 100%);display:flex;align-items:center;justify-content:center;gap:160px;font-family:Inter,'Helvetica Neue',Arial,sans-serif}
img{width:820px;height:820px;mix-blend-mode:screen}
h1{color:#fff;font-size:${app.name.length > 12 ? 190 : 250}px;font-weight:600;margin:0;letter-spacing:-4px;max-width:1400px}
</style></head><body><img src="${logo}" alt=""><h1>${escapeHtml(app.name)}</h1></body></html>`;

type Chromium = {
  launch: () => Promise<{
    newPage: (options: { viewport: { width: number; height: number } }) => Promise<{
      setContent: (html: string) => Promise<void>;
      waitForLoadState: (state: 'networkidle') => Promise<void>;
      screenshot: () => Promise<Buffer>;
    }>;
    close: () => Promise<void>;
  }>;
};

const readGlobalRoot = () => {
  try {
    return execSync('npm root -g', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};
const globalRoot = readGlobalRoot();
// Playwright isn't a dependency: the repo's copy if one is installed, else the global one (ESM never looks there itself).
const PLAYWRIGHT_PATHS = [
  'playwright',
  ...(globalRoot ? [`${globalRoot}/playwright/index.mjs`] : []),
  '/opt/node22/lib/node_modules/playwright/index.mjs',
];
const PLAYWRIGHT_HINT = 'Run `npm i -g playwright && npx playwright install chromium`, then try again.';

const loadChromium = async (): Promise<Chromium> => {
  const loaded = await PLAYWRIGHT_PATHS.reduce<Promise<Chromium | null>>(
    async (found, path) =>
      (await found) ??
      import(path).then((module: { chromium: Chromium }) => module.chromium).catch(() => null),
    Promise.resolve(null),
  );
  if (loaded) return loaded;
  console.error(`Couldn't load Playwright (looked in: ${PLAYWRIGHT_PATHS.join(', ')}). ${PLAYWRIGHT_HINT}`);
  process.exit(1);
};

const chromium = await loadChromium();
const browser = await chromium.launch().catch((error: Error) => {
  console.error(`Playwright couldn't start Chromium: ${error.message.split('\n')[0]}\n${PLAYWRIGHT_HINT}`);
  process.exit(1);
});
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
await page.setContent(html);
await page.waitForLoadState('networkidle');
writeFileSync(bannerPath, await page.screenshot());
await browser.close();
console.log(`Wrote ${bannerPath} (${app.name}, ${darker} to ${primary}).`);
