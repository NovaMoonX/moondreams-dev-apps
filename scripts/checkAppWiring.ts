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

if (problems.length > 0) {
  console.error(
    `App wiring is incomplete:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nSee "New mini-app checklist" in .github/copilot-instructions.md.`,
  );
  process.exit(1);
}

console.log(`App wiring OK for ${APP_REGISTRY.length} apps.`);
