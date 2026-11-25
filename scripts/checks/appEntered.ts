import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP_REGISTRY } from '../../src/lib/app/app.registry.ts';

// The What's new pop-up waits until an app's own screens show, so every app and home must mark
// itself entered (docs/conventions/new-app.md "Register it").

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
  })),
  {
    scope: 'site',
    where: 'src/screens/Home.tsx',
    isMarked: hasMark(siteFiles, 'site'),
  },
];

results.forEach(({ scope, isMarked }) =>
  console.log(`${isMarked ? '✅' : '❌'} ${scope}`),
);

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
  process.exit(1);
}
