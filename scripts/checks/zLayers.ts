import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The site's header (with the dev account switcher's menu inside it) sits at 35, and its menu
// can't climb out of that layer, so a pinned app surface above 30 paints over it.
const APP_CEILING = 30;
const ROOT = 'src/apps';

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });

const readLayer = (token: string): number | null => {
  const match = /^z-(?:\[(\d+)\]|(\d+))$/.exec(token);
  if (!match) return null;
  return Number(match[1] ?? match[2]);
};

const findOffenders = (path: string): string[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      const tokens = line.split(/[\s'"`]+/);
      const isPinned = tokens.some((token) =>
        /^(max-\w+:|sm:|md:|lg:)*(fixed|sticky)$/.test(token),
      );
      if (!isPinned) return [];
      const layers = tokens
        .map((token) => readLayer(token.replace(/^([\w-]+:)+/, '')))
        .filter(
          (layer): layer is number => layer !== null && layer > APP_CEILING,
        );
      return layers.map(
        (layer) =>
          `${path}:${index + 1} pins at z-${layer}, above the app ceiling of ${APP_CEILING}`,
      );
    });

const offenders = listFiles(ROOT).flatMap(findOffenders);

if (offenders.length > 0) {
  console.error(offenders.join('\n'));
  console.error(
    `\nA fixed or sticky surface inside an app stays at z-${APP_CEILING} or below so the site header and its menus stay on top (docs/conventions/app-look.md "Layers").`,
  );
  process.exit(1);
}

console.log(
  `z-layers: every pinned app surface is at z-${APP_CEILING} or below`,
);
