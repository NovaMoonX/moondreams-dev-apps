import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP_REGISTRY } from '../src/lib/app/app.registry.ts';

// Fails the build when a registered app is missing the usage tracking that the admin dashboard
// depends on. The full list of what a new app needs is the "New mini-app checklist" in
// .github/copilot-instructions.md.

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const finderMap = readFileSync('functions/src/appUsage/registerAppUsage.ts', 'utf8');

const problems = APP_REGISTRY.flatMap((app) => {
  const finderPath = `functions/src/apps/${app.id}/findFirstActivityAt.ts`;
  const appDir = `src/apps/${app.id}`;
  const callsTracker =
    existsSync(appDir) &&
    listFiles(appDir).some((file) =>
      readFileSync(file, 'utf8').includes(`useTrackAppUsage('${app.id}'`),
    );
  const isRegisteredFinder = new RegExp(`['"]?${app.id}['"]?\\s*:\\s*\\w+`).test(finderMap);

  return [
    existsSync(finderPath) ? null : `${app.id}: missing ${finderPath}`,
    isRegisteredFinder ? null : `${app.id}: not listed in FIRST_ACTIVITY_FINDERS (registerAppUsage.ts)`,
    callsTracker ? null : `${app.id}: no useTrackAppUsage('${app.id}', …) call under ${appDir}/`,
  ].filter((problem): problem is string => problem !== null);
});

// A theme sets the floating-surface tokens in its light and dark blocks, or its popovers, dropdowns and tooltips keep the
// site's white/zinc defaults; `--subview-backdrop:` tints the page behind a subview's card (its dark value has a default).
const THEME_TOKENS = [
  { token: '--color-popover:', inEachBlock: true },
  { token: '--color-popover-foreground:', inEachBlock: true },
  { token: '--color-tooltip:', inEachBlock: true },
  { token: '--color-tooltip-foreground:', inEachBlock: true },
  { token: '--subview-backdrop:', inEachBlock: false },
];

const themeProblems = listFiles('src/apps')
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) => {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = Array.from(
      css.matchAll(/html\.[\w-]+-theme(\.dark)?\s*\{([^}]*)\}/g),
      (match) => ({ isDark: match[1] !== undefined, body: match[2] }),
    );
    const sets = (isDark: boolean, token: string) =>
      rules.some((rule) => rule.isDark === isDark && rule.body.includes(token));
    const hasDarkRule = rules.some((rule) => rule.isDark);
    return THEME_TOKENS.flatMap(({ token, inEachBlock }) => {
      const missingLight = !sets(false, token);
      const missingDark = inEachBlock && hasDarkRule && !sets(true, token);
      return missingLight || missingDark
        ? [`${file}: does not set ${token} in its ${missingLight ? 'light' : 'dark'} block`]
        : [];
    });
  });

problems.push(...themeProblems);

// Text on a themed fill must stay readable in light and dark. The top strip (OfflineBanner: "New version ready · Restart")
// is `primary` with `primary-foreground`, and its button is the same pair swapped, so one ratio covers both.
const MIN_CONTRAST = 4.5;
const CONTRAST_PAIRS = [
  ['--color-primary', '--color-primary-foreground'],
  ['--color-secondary', '--color-secondary-foreground'],
  ['--color-accent', '--color-accent-foreground'],
  ['--color-popover', '--color-popover-foreground'],
  ['--color-tooltip', '--color-tooltip-foreground'],
  ['--color-destructive', '--color-destructive-foreground'],
  ['--color-success', '--color-success-foreground'],
  ['--color-warning', '--color-warning-foreground'],
];

const readTokens = (css: string) =>
  new Map(
    Array.from(css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (match): [string, string] => [
      match[1],
      match[2].trim(),
    ]),
  );

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const palette = existsSync('node_modules/tailwindcss/theme.css')
  ? readTokens(stripComments(readFileSync('node_modules/tailwindcss/theme.css', 'utf8')))
  : new Map<string, string>();
const siteDefaults = readTokens(stripComments(readFileSync('src/dreamer-ui.css', 'utf8')));

/** Relative luminance of an `oklch()`, hex, white or black value, or null when it cannot be read. */
const readLuminance = (value: string, tokens: Map<string, string>, depth = 0): number | null => {
  if (depth > 6) return null;
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (reference) {
    const next = tokens.get(reference[1]) ?? siteDefaults.get(reference[1]) ?? palette.get(reference[1]);
    return next ? readLuminance(next, tokens, depth + 1) : null;
  }
  if (value === 'white' || value === '#fff') return 1;
  if (value === 'black' || value === '#000') return 0;
  const oklch = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (!oklch) return null;
  const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1);
  const chroma = Number(oklch[3]);
  const hue = (Number(oklch[4]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const [red, green, blue] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const getContrast = (first: number, second: number) =>
  (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);

const contrastProblems = listFiles('src/apps')
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    const rules = Array.from(
      css.matchAll(/html\.[\w-]+-theme(\.dark)?\s*\{([^}]*)\}/g),
      (match) => ({ isDark: match[1] !== undefined, tokens: readTokens(match[2]) }),
    );
    return [false, true].flatMap((isDark) => {
      // A dark block only overrides some tokens, so it sits on top of the light block and the site's defaults.
      const tokens = new Map([
        ...(isDark ? rules.filter((rule) => !rule.isDark) : []).flatMap((rule) => [...rule.tokens]),
        ...rules.filter((rule) => rule.isDark === isDark).flatMap((rule) => [...rule.tokens]),
      ]);
      return CONTRAST_PAIRS.flatMap(([fill, text]) => {
        if (!tokens.has(fill) && !tokens.has(text)) return [];
        const [fillValue, textValue] = [fill, text].map((token) => {
          const value = tokens.get(token) ?? siteDefaults.get(token);
          return value ? readLuminance(value, tokens) : null;
        });
        if (fillValue === null || textValue === null) return [];
        const ratio = getContrast(fillValue, textValue);
        return ratio >= MIN_CONTRAST
          ? []
          : [`${file}: ${text} on ${fill} is ${ratio.toFixed(2)}:1 in ${isDark ? 'dark' : 'light'} (needs ${MIN_CONTRAST}:1)`];
      });
    });
  });

problems.push(...contrastProblems);

if (problems.length > 0) {
  console.error(
    `App wiring is incomplete:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nSee "New mini-app checklist" in .github/copilot-instructions.md.`,
  );
  process.exit(1);
}

console.log(`App wiring OK for ${APP_REGISTRY.length} apps.`);
