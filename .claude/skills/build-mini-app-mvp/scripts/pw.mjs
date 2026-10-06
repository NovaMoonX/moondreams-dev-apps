// shared helpers for throwaway validation scripts
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
export const BASE = 'http://127.0.0.1:5173';
export async function open({ mobile = true, showToasts = false } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  await ctx.addInitScript((keepToasts) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.firebase-emulator-warning{display:none!important}' + (keepToasts ? '' : ' [role="region"].fixed.pointer-events-none{display:none!important}'); document.head.appendChild(st); }); }, showToasts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('DEBUG')) console.log('CONSOLE', m.text().slice(0, 300)); });
  return { browser, page };
}
export async function signIn(page, label = 'Alex') {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: /Dev/ }).first().click();
  await page.getByText(label, { exact: false }).last().click();
  await page.waitForTimeout(2500);
}
