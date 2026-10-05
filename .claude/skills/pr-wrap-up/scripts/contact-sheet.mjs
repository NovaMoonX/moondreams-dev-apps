// Lays PNGs side by side in one image so a set of screenshots can be reviewed with a single look.
// usage: node contact-sheet.mjs <out.png> <image-height-px> <dir> <name1> <name2> ...   (names without .png)
import fs from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const [out, height, dir, ...names] = process.argv.slice(2);
const cells = names
  .map(
    (name) =>
      `<figure style="margin:0"><img style="height:${height}px;display:block" src="file://${dir}/${name}.png"><figcaption style="color:#fff;font:12px sans-serif">${name}</figcaption></figure>`,
  )
  .join('');
fs.writeFileSync(`${out}.html`, `<body style="margin:0;background:#888;display:flex;gap:8px;align-items:flex-start">${cells}</body>`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: Number(height) + 30 } });
await page.goto(`file://${out}.html`);
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
fs.rmSync(`${out}.html`);
