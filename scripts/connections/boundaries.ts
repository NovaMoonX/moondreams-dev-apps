// `npm run check:connection-boundaries` (`-- --self-test` proves the check can fail).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const APP_IDS = Array.from(
  readFileSync(join(ROOT, 'src/lib/types/appCatalog.ts'), 'utf8')
    .match(/export type AppId =([^;]*);/)?.[1]
    .matchAll(/'([a-z][a-z0-9-]*)'/g) ?? [],
  (match) => match[1],
);

const APP_NAMES = [
  'A-List',
  'Going Once',
  'Helm',
  'Nine Lives',
  'Pinch',
  'Runway',
  'Waypoint',
  'Worth the Wait',
];

/** What an app owns and the shared platform must never name. Matched as whole words after a camelCase name is split. */
const ENTITY_WORDS = [
  'recipe',
  'meal',
  'kitchen',
  'pantry',
  'ingredient',
  'trip',
  'itinerary',
  'cat',
  'vet',
  'clinic',
  'movie',
  'showing',
  'theater',
  'theatre',
  'sale',
  'budget',
  'box',
  'household',
];

interface Hit {
  file: string;
  kind: 'cross-app' | 'word';
  match: string;
}

interface Allowed extends Hit {
  why: string;
}

/** Hits that exist today and are intended or not yet fixed; a hit not listed fails, and an entry that no longer matches fails too. */
const ALLOWED: Allowed[] = [
  {
    file: 'src/lib/connections/contract.ts',
    kind: 'word',
    match: 'trip',
    why: 'The shared kinds include a trip, as the contract declares it.',
  },
  {
    file: 'functions/src/vendor/connectionsContract.ts',
    kind: 'word',
    match: 'trip',
    why: 'Generated copy of the contract.',
  },
  {
    file: 'src/lib/connections/readers.ts',
    kind: 'word',
    match: 'helm',
    why: 'The reader registry names the apps that read.',
  },
  {
    file: 'src/lib/connections/sources.ts',
    kind: 'word',
    match: 'helm',
    why: 'The source registry names the apps that read and share.',
  },
  {
    file: 'src/lib/connections/sources.ts',
    kind: 'word',
    match: 'pinch',
    why: "The source registry re-exports each app's manifest.",
  },
  {
    file: 'functions/src/connections/registry.ts',
    kind: 'word',
    match: 'helm',
    why: 'The reader table is keyed by the app that reads; naming it is the registration.',
  },
  {
    file: 'functions/src/connections/registry.ts',
    kind: 'word',
    match: 'pinch',
    why: 'The source table is keyed by connector id and imports the one adapter each app owns.',
  },
];

const SKIPPED_DIRS = new Set(['node_modules', 'lib', 'dist']);

const listFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory())
          return SKIPPED_DIRS.has(name) ? [] : listFiles(path);
        return /\.(ts|tsx)$/.test(name) ? [path] : [];
      })
    : [];

const isCommentLine = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);

const codeLines = (text: string) =>
  text.split('\n').filter((line) => !isCommentLine(line));

const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** The app a path names (`.../apps/<id>/...`), or null. */
const readAppOfPath = (path: string, appIds: string[]) =>
  appIds.find((id) => new RegExp(`(^|/)apps/${id}(/|$)`).test(path)) ?? null;

export function findCrossAppHits(
  file: string,
  text: string,
  appIds: string[],
): Hit[] {
  const own = readAppOfPath(file, appIds);
  if (own === null) return [];
  const code = codeLines(text).join('\n');

  const imports = Array.from(code.matchAll(SPECIFIER), (match) => {
    const specifier = match[1];
    const target = specifier.startsWith('.')
      ? relative(ROOT, resolve(ROOT, dirname(file), specifier)).replaceAll(
          '\\',
          '/',
        )
      : specifier;
    const normalized = target
      .replace(/^@apps\//, 'apps/')
      .replace(/^@\/apps\//, 'apps/');
    return { specifier, other: readAppOfPath(normalized, appIds) };
  });
  const importHits = imports.flatMap(({ specifier, other }) =>
    other !== null && other !== own
      ? [{ file, kind: 'cross-app' as const, match: specifier }]
      : [],
  );

  const pathHits = appIds
    .filter((id) => id !== own)
    .flatMap((id) =>
      new RegExp(`apps/${id}/`).test(code.replace(SPECIFIER, ''))
        ? [{ file, kind: 'cross-app' as const, match: `apps/${id}/` }]
        : [],
    );
  return [...importHits, ...pathHits];
}

const splitWords = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z]+/g, ' ')
    .toLowerCase();

export function findEntityHits(file: string, text: string): Hit[] {
  const words = new Set(splitWords(text).split(' '));
  const wordHits = ENTITY_WORDS.filter(
    (word) =>
      words.has(word) || words.has(`${word}s`) || words.has(`${word}es`),
  );
  const flat = splitWords(text);
  const nameHits = [...APP_NAMES, ...APP_IDS].flatMap((name) => {
    const needle = splitWords(name).trim();
    return new RegExp(`(^| )${needle}( |$)`).test(flat) ? [needle] : [];
  });
  return [...wordHits, ...nameHits].map((match) => ({
    file,
    kind: 'word' as const,
    match,
  }));
}

const SHARED_PATHS = [
  'src/lib/connections',
  'functions/src/connections',
  'functions/src/vendor/connectionsContract.ts',
  'src/components/ConnectedSourcesList.tsx',
];

const listShared = () =>
  SHARED_PATHS.flatMap((path) =>
    existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isDirectory()
      ? listFiles(join(ROOT, path))
      : existsSync(join(ROOT, path))
        ? [join(ROOT, path)]
        : [],
  );

const toRelative = (path: string) => relative(ROOT, path).replaceAll('\\', '/');

const isAllowed = (hit: Hit) =>
  ALLOWED.some(
    (entry) =>
      entry.file === hit.file &&
      entry.kind === hit.kind &&
      entry.match === hit.match,
  );

function selfTest() {
  const ids = ['pinch', 'runway', 'helm'];
  const crossImport = findCrossAppHits(
    'src/apps/runway/Plan.tsx',
    "import type { Recipe } from '@apps/pinch/types';\n",
    ids,
  );
  assert(crossImport.length === 1, 'a planted cross-app import must fail');
  const crossRelative = findCrossAppHits(
    'functions/src/apps/runway/x.ts',
    "import { y } from '../pinch/y.js';\n",
    ids,
  );
  assert(
    crossRelative.length === 1,
    'a planted relative cross-app import must fail',
  );
  const crossPath = findCrossAppHits(
    'functions/src/apps/helm/x.ts',
    'const path = `apps/pinch/kitchens/${uid}`;\n',
    ids,
  );
  assert(crossPath.length === 1, 'a planted cross-app path must fail');
  assert(
    findCrossAppHits(
      'src/apps/pinch/x.ts',
      "import { a } from '@apps/pinch/types';\nconst p = 'apps/pinch/x/';\n",
      ids,
    ).length === 0,
    "an app's own paths are fine",
  );
  assert(
    findEntityHits('src/lib/connections/x.ts', 'const recipeTitle = 1;')
      .length === 1,
    'a planted entity word must fail',
  );
  assert(
    findEntityHits('src/lib/connections/x.ts', 'export const category = 1;')
      .length === 0,
    'a plain word is fine',
  );
  console.log(
    'Self-test passed: a planted cross-app import and entity word both fail.',
  );
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`Self-test failed: ${message}`);
    process.exit(1);
  }
}

function main() {
  console.log(`Apps checked: ${APP_IDS.join(', ')}`);
  const appFiles = APP_IDS.flatMap((id) => [
    ...listFiles(join(ROOT, 'src/apps', id)),
    ...listFiles(join(ROOT, 'functions/src/apps', id)),
  ]);
  const hits = [
    ...appFiles.flatMap((path) =>
      findCrossAppHits(toRelative(path), readFileSync(path, 'utf8'), APP_IDS),
    ),
    ...listShared().flatMap((path) =>
      findEntityHits(toRelative(path), readFileSync(path, 'utf8')),
    ),
  ];

  const unique = hits.filter(
    (hit, index) =>
      hits.findIndex(
        (other) =>
          other.file === hit.file &&
          other.kind === hit.kind &&
          other.match === hit.match,
      ) === index,
  );
  const unlisted = unique.filter((hit) => !isAllowed(hit));
  const stale = ALLOWED.filter(
    (entry) =>
      !unique.some(
        (hit) =>
          hit.file === entry.file &&
          hit.kind === entry.kind &&
          hit.match === entry.match,
      ),
  );
  unlisted.forEach((hit) =>
    console.error(`${hit.file}: ${hit.kind} "${hit.match}"`),
  );
  stale.forEach((entry) =>
    console.error(
      `Allowlist entry no longer needed: ${entry.file} ${entry.kind} "${entry.match}"`,
    ),
  );
  if (unlisted.length > 0 || stale.length > 0) process.exit(1);
  console.log(
    `Boundaries hold (${appFiles.length} app files, ${listShared().length} shared files, ${ALLOWED.length} allowed).`,
  );
}

if (process.argv.includes('--self-test')) selfTest();
else main();
