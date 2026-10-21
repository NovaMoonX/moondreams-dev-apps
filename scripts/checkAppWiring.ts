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
    const css = readFileSync(file, 'utf8');
    const blocks = /\.dark\s*\{/.test(css) ? 2 : 1;
    return THEME_TOKENS.filter(
      ({ token, inEachBlock }) =>
        css.split(token).length - 1 < (inEachBlock ? blocks : 1),
    ).map(
      ({ token, inEachBlock }) =>
        `${file}: does not set ${token}${inEachBlock && blocks === 2 ? ' in both its light and dark blocks' : ''}`,
    );
  });

problems.push(...themeProblems);

if (problems.length > 0) {
  console.error(
    `App wiring is incomplete:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nSee "New mini-app checklist" in .github/copilot-instructions.md.`,
  );
  process.exit(1);
}

console.log(`App wiring OK for ${APP_REGISTRY.length} apps.`);
