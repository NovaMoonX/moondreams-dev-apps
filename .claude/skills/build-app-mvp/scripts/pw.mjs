// shared helpers for throwaway validation scripts
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
export const BASE = 'http://127.0.0.1:5173';
// The sandbox can't reach outside services, so a screen fed by them would look complete without them: answer with fixtures.
const FIXTURE_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c177"/><stop offset=".6" stop-color="#e07a5f"/><stop offset="1" stop-color="#2a9d8f"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/></svg>`;
export async function fillOutsideData(ctx) {
  await ctx.route(/picsum\.photos|images\.unsplash\.com/, (route) => route.fulfill({ contentType: 'image/svg+xml', body: FIXTURE_IMAGE }));
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast/, (route) => {
    const url = new URL(route.request().url());
    const start = new Date(`${url.searchParams.get('start_date')}T00:00:00Z`);
    const end = new Date(`${url.searchParams.get('end_date')}T00:00:00Z`);
    const days = Array.from({ length: Math.max(0, Math.round((end - start) / 86_400_000) + 1) }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
    const hours = days.flatMap((day) => Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`));
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        timezone: url.searchParams.get('timezone'),
        daily: { time: days, weather_code: days.map((_, i) => [1, 61, 3, 0][i % 4]), temperature_2m_max: days.map((_, i) => 58 + i), temperature_2m_min: days.map((_, i) => 44 + i), precipitation_probability_max: days.map((_, i) => [10, 70, 30, 0][i % 4]) },
        hourly: { time: hours, weather_code: hours.map(() => 2), temperature_2m: hours.map(() => 52), precipitation_probability: hours.map(() => 20) },
      }),
    });
  });
}
export async function open({ mobile = true, showToasts = false } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  await ctx.addInitScript((keepToasts) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.firebase-emulator-warning{display:none!important}' + (keepToasts ? '' : ' [role="region"].fixed.pointer-events-none{display:none!important}'); document.head.appendChild(st); }); }, showToasts);
  await fillOutsideData(ctx);
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
