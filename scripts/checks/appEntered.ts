import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP_REGISTRY } from '../../src/lib/app/app.registry.ts';
import { hasOwnWhatsNewLook } from '../../src/lib/whatsNew/whatsNewLooks.ts';

// The What's new pop-up waits until an app's own screens show and while the app asks something of
// its own, and is drawn in each app's look (docs/conventions/new-app.md "Register it").

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

const isSource = (file: string) => /\.tsx?$/.test(file);
const hasMark = (files: string[], scope: string) =>
  files.some((file) => {
    const text = readFileSync(file, 'utf8');
    return (
      text.includes(`<AppEnteredMark scope='${scope}'`) ||
      new RegExp(`useMarkAppEntered\\(\\s*'${scope}'`).test(text)
    );
  });

const appFiles = (id: string) => listFiles(`src/apps/${id}`).filter(isSource);
const siteFiles = readdirSync('src', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'apps')
  .flatMap((entry) => listFiles(join('src', entry.name)))
  .filter(isSource);

const results = [
  ...APP_REGISTRY.map((app) => ({
    scope: app.id,
    where: `src/apps/${app.id}/`,
    isMarked: hasMark(appFiles(app.id), app.id),
    hasLook: hasOwnWhatsNewLook(app.id),
  })),
  {
    scope: 'site',
    where: 'src/screens/Home.tsx',
    isMarked: hasMark(siteFiles, 'site'),
    hasLook: hasOwnWhatsNewLook('site'),
  },
];

const wrongAsking = APP_REGISTRY.flatMap((app) =>
  appFiles(app.id).flatMap((file) =>
    Array.from(
      readFileSync(file, 'utf8').matchAll(
        /(?:<AppAskingMark\s+scope=\{?\s*|useMarkAppAsking\(\s*)(['"]?)([^'"\s})]+)\1/g,
      ),
    )
      .filter((match) => !match[1] || match[2] !== app.id)
      .map(
        (match) =>
          `${file}: asking mark for ${match[1] ? `'${match[2]}'` : `a non-literal scope (${match[2]})`}, expected '${app.id}'`,
      ),
  ),
);

results.forEach(({ scope, isMarked, hasLook }) =>
  console.log(
    `${isMarked && hasLook ? '✅' : '❌'} ${scope}${isMarked ? '' : ' (no entered mark)'}${hasLook ? '' : " (no What's new look)"}`,
  ),
);

const noLook = results.filter((result) => !result.hasLook);
if (noLook.length > 0) {
  console.error(
    `\nNo What's new look for: ${noLook.map((result) => result.scope).join(', ')}.\n` +
      "  Add one to LOOKS in src/lib/whatsNew/whatsNewLooks.ts, chosen from how the app's own rows, icons and buttons look (docs/conventions/app-look.md \"What's new wears the app's look\").",
  );
}
if (wrongAsking.length > 0) {
  console.error(`\n${wrongAsking.join('\n')}`);
}

const missing = results.filter((result) => !result.isMarked);
if (missing.length > 0) {
  console.error(
    `\nNo entered mark for: ${missing.map((result) => result.scope).join(', ')}.\n` +
      missing
        .map(
          (result) =>
            `  ${result.scope}: render <AppEnteredMark scope='${result.scope}' /> (@/components/AppEnteredMark) under ${result.where}, only where its own screens show, never in loading, sign-in, landing, locked or error states.`,
        )
        .join('\n'),
  );
}
if (missing.length > 0 || noLook.length > 0 || wrongAsking.length > 0) {
  process.exit(1);
}
