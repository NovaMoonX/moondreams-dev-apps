import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { APP_REGISTRY } from '../src/lib/app/app.registry';

/** Renders `public/banners/by-app/banner-<id>.png` (2560x1440, the link preview's picture) from the app's logo, name and primary colour. */

const [appId, flag] = process.argv.slice(2);
const isForced = flag === '--force';
const app = APP_REGISTRY.find((entry) => entry.id === appId);
if (!app) {
  console.error(`Usage: npm run make:banner -- <app id> [--force]\nApp ids: ${APP_REGISTRY.map((entry) => entry.id).join(', ')}`);
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
const primary =
  (existsSync(themePath) ? readFileSync(themePath, 'utf8') : '').match(/--color-primary:\s*(#[0-9a-f]{6})\b/i)?.[1] ??
  '#1f2937';
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

// Playwright isn't a dependency: it is the copy installed globally (the sandbox's, or one the owner installs).
const PLAYWRIGHT_PATHS = ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs'];

const loadChromium = async (): Promise<Chromium> => {
  const loaded = await PLAYWRIGHT_PATHS.reduce<Promise<Chromium | null>>(
    async (found, path) =>
      (await found) ??
      import(path).then((module: { chromium: Chromium }) => module.chromium).catch(() => null),
    Promise.resolve(null),
  );
  if (loaded) return loaded;
  console.error('Needs Playwright: run `npm i -g playwright && npx playwright install chromium`, then try again.');
  process.exit(1);
};

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
await page.setContent(html);
await page.waitForLoadState('networkidle');
writeFileSync(bannerPath, await page.screenshot());
await browser.close();
console.log(`Wrote ${bannerPath} (${app.name}, ${darker} to ${primary}).`);
