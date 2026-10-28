import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP_REGISTRY } from '../src/lib/app/app.registry.ts';

// Fails the build when a registered app is missing the usage tracking that the admin dashboard
// depends on. The full list of what a new app needs is the New app checklist in
// docs/conventions/new-app.md.

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

// Text on a themed fill must stay readable in light and dark. The top strip (OfflineBanner: offline, slow, "New version ready · Restart")
// is `primary` with `primary-foreground`, and its button is that pair swapped, so one ratio covers both. A pair the theme sets
// but this script cannot measure is a failure, never a skip, or the check would pass by reading nothing.
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

type Lab = [number, number, number];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const readTokens = (css: string) =>
  new Map(
    Array.from(css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (match): [string, string] => [
      match[1],
      match[2].trim(),
    ]),
  );
const readBlocks = (css: string, selector: RegExp) =>
  new Map(
    Array.from(css.matchAll(new RegExp(`(?:^|\\n)${selector.source}\\s*\\{([^}]*)\\}`, 'g')), (match) => [
      ...readTokens(match[1]),
    ]).flat(),
  );

const paletteFile = 'node_modules/tailwindcss/theme.css';
const palette = existsSync(paletteFile)
  ? readTokens(stripComments(readFileSync(paletteFile, 'utf8')))
  : new Map<string, string>();
if (palette.size === 0) {
  problems.push(`${paletteFile} is missing or empty, so theme colors cannot be measured (run npm ci)`);
}

// The site's own tokens, per mode: Dreamer UI's theme, then the app shell's background and foreground; dark sits on top of light.
const siteCss = ['src/dreamer-ui.css', 'src/index.css'].map((file) => stripComments(readFileSync(file, 'utf8')));
const siteLight = new Map(siteCss.flatMap((css) => [...readBlocks(css, /@theme [\w-]+/)]));
const siteDark = new Map([...siteLight, ...siteCss.flatMap((css) => [...readBlocks(css, /\.dark/)])]);

const WHITE: Lab = [1, 0, 0];
const BLACK: Lab = [0, 0, 0];

const srgbToLab = (red: number, green: number, blue: number): Lab => {
  const linear = [red, green, blue].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = linear;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const splitTopLevel = (value: string) =>
  Array.from(value).reduce<{ parts: string[]; depth: number }>(
    (state, char) => {
      if (char === ',' && state.depth === 0) return { ...state, parts: [...state.parts, ''] };
      const depth = state.depth + (char === '(' ? 1 : char === ')' ? -1 : 0);
      const parts = [...state.parts.slice(0, -1), state.parts[state.parts.length - 1] + char];
      return { parts, depth };
    },
    { parts: [''], depth: 0 },
  ).parts.map((part) => part.trim());

/** An OKLab color from `oklch()`, hex, white, black, `var()` or an oklab `color-mix()`, or null when unreadable. */
const readColor = (value: string, tokens: Map<string, string>, depth = 0): Lab | null => {
  if (depth > 8) return null;
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (reference) {
    const next = tokens.get(reference[1]) ?? palette.get(reference[1]);
    return next ? readColor(next, tokens, depth + 1) : null;
  }
  if (value === 'white') return WHITE;
  if (value === 'black') return BLACK;
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? Array.from(hex[1], (c) => c + c).join('') : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16) / 255);
    return srgbToLab(r, g, b);
  }
  const oklch = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+|none)/);
  if (oklch) {
    const hue = ((oklch[4] === 'none' ? 0 : Number(oklch[4])) * Math.PI) / 180;
    const chroma = Number(oklch[3]);
    return [Number(oklch[1]) / (oklch[2] ? 100 : 1), chroma * Math.cos(hue), chroma * Math.sin(hue)];
  }
  const mix = value.match(/^color-mix\((.*)\)$/s);
  if (!mix) return null;
  const [space, ...stops] = splitTopLevel(mix[1]);
  if (space !== 'in oklab' || stops.length !== 2) return null;
  const parsed = stops.map((stop) => {
    const share = stop.match(/^(.*\S)\s+([\d.]+)%$/);
    return { color: readColor(share ? share[1] : stop, tokens, depth + 1), share: share ? Number(share[2]) : null };
  });
  const [first, second] = parsed;
  if (!first.color || !second.color) return null;
  const firstShare = first.share ?? (second.share === null ? 50 : 100 - second.share);
  const secondShare = second.share ?? 100 - firstShare;
  const total = firstShare + secondShare;
  if (total <= 0) return null;
  const [fa, fb] = [firstShare / total, secondShare / total];
  return [0, 1, 2].map((i) => first.color![i] * fa + second.color![i] * fb) as Lab;
};

const getLuminance = ([lightness, a, b]: Lab) => {
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

const getContrast = (first: Lab, second: Lab) => {
  const [a, b] = [getLuminance(first), getLuminance(second)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const contrastProblems = listFiles('src/apps')
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    const rules = Array.from(
      css.matchAll(/html\.[\w-]+-theme(\.dark)?\s*\{([^}]*)\}/g),
      (match) => ({ isDark: match[1] !== undefined, tokens: readTokens(match[2]) }),
    );
    return [false, true].flatMap((isDark) => {
      const own = new Map([
        ...(isDark ? rules.filter((rule) => !rule.isDark) : []).flatMap((rule) => [...rule.tokens]),
        ...rules.filter((rule) => rule.isDark === isDark).flatMap((rule) => [...rule.tokens]),
      ]);
      // A dark block only overrides some tokens, so it sits on top of the light block and the site's own values.
      const tokens = new Map([...(isDark ? siteDark : siteLight), ...own]);
      const mode = isDark ? 'dark' : 'light';
      return CONTRAST_PAIRS.flatMap(([fill, text]) => {
        if (!own.has(fill) && !own.has(text)) return [];
        const [fillColor, textColor] = [fill, text].map((token) => {
          const value = tokens.get(token);
          return value ? readColor(value, tokens) : null;
        });
        if (!fillColor || !textColor) {
          return [`${file}: cannot measure ${text} on ${fill} in ${mode} (a value this check cannot read)`];
        }
        const ratio = getContrast(fillColor, textColor);
        return ratio >= MIN_CONTRAST
          ? []
          : [`${file}: ${text} on ${fill} is ${ratio.toFixed(2)}:1 in ${mode} (needs ${MIN_CONTRAST}:1)`];
      });
    });
  });

problems.push(...contrastProblems);

if (problems.length > 0) {
  console.error(
    `App wiring is incomplete:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nSee the New app checklist in docs/conventions/new-app.md.`,
  );
  process.exit(1);
}

console.log(`App wiring OK for ${APP_REGISTRY.length} apps.`);
