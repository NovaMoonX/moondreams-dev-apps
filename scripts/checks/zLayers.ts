import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The site's header (with the dev account switcher's menu inside it) sits at 35, and its menu
// can't climb out of that layer, so a pinned app surface above 30 paints over it.
// Reads Tailwind classes only: inline zIndex and app stylesheets are out of its reach.
const APP_CEILING = 30;
const ROOT = 'src/apps';

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAREN_STEPS: Record<string, number> = { '(': 1, ')': -1 };

const readBalanced = (source: string, open: number): string => {
  const end = Array.from(source.slice(open)).reduce<{
    depth: number;
    at: number;
  }>(
    (state, char, index) => {
      if (state.at >= 0) return state;
      const depth = state.depth + (PAREN_STEPS[char] ?? 0);
      return { depth, at: depth === 0 ? index : -1 };
    },
    { depth: 0, at: -1 },
  ).at;
  return source.slice(open, end < 0 ? undefined : open + end + 1);
};

/** Each className value or join(...) call, so a class list split over several lines is read as one. */
const readClassLists = (source: string): { text: string; offset: number }[] => {
  const calls = Array.from(source.matchAll(/\bjoin\(/g)).map((match) => ({
    text: readBalanced(source, (match.index ?? 0) + 4),
    offset: match.index ?? 0,
  }));
  const literals = Array.from(
    source.matchAll(/className=(?:'[^']*'|"[^"]*"|\{`[^`]*`\})/g),
  ).map((match) => ({ text: match[0], offset: match.index ?? 0 }));
  return [...calls, ...literals];
};

const toUtility = (token: string) =>
  token.replace(/^(?:[^\s:'"`]+:)+/, '').replace(/^!|!$/g, '');

const readLayer = (utility: string): number | null => {
  const match = /^z-(?:\[(\d+)\]|(\d+))$/.exec(utility);
  if (!match) return null;
  return Number(match[1] ?? match[2]);
};

const findOffenders = (path: string): string[] => {
  const source = stripComments(readFileSync(path, 'utf8'));
  return readClassLists(source).flatMap(({ text, offset }) => {
    const utilities = text.split(/[\s'"`,(){}?&|]+/).map(toUtility);
    if (
      !utilities.some((utility) => utility === 'fixed' || utility === 'sticky')
    )
      return [];
    const line = source.slice(0, offset).split('\n').length;
    return utilities
      .map(readLayer)
      .filter((layer): layer is number => layer !== null && layer > APP_CEILING)
      .map(
        (layer) =>
          `${path}:${line} pins at z-${layer}, above the app ceiling of ${APP_CEILING}`,
      );
  });
};

const offenders = Array.from(new Set(listFiles(ROOT).flatMap(findOffenders)));

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
