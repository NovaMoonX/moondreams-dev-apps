// `npm run connections:vendor` writes the server's copies; `npm run check:server-copies` fails when one differs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CATALOG_INGREDIENTS } from '../../src/apps/pinch/catalog/catalogIngredients.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT = 'scripts/checks/serverCopies.ts';

interface Copy {
  src: string;
  dest: string;
  /** Import specifiers in the source, each replaced in the copy. */
  importRewrites: Record<string, string>;
}

const COPIES: Copy[] = [
  {
    src: 'src/lib/connections/contract.ts',
    dest: 'functions/src/vendor/connectionsContract.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/pinch/share/manifest.ts',
    dest: 'functions/src/apps/pinch/share/manifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/apps/a-list/share/manifest.ts',
    dest: 'functions/src/apps/a-list/share/manifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/apps/going-once/share/manifest.ts',
    dest: 'functions/src/apps/going-once/share/manifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/apps/nine-lives/share/manifest.ts',
    dest: 'functions/src/apps/nine-lives/share/manifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/lib/connections/google/calendarManifest.ts',
    dest: 'functions/src/connections/google/calendarManifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../vendor/connectionsContract.js',
    },
  },
];

interface Generated {
  src: string;
  dest: string;
  build: () => string;
}

const GENERATED: Generated[] = [
  {
    src: 'src/apps/pinch/catalog/catalogIngredients.ts',
    dest: 'functions/src/apps/pinch/share/catalogNames.ts',
    build: () =>
      `export const CATALOG_NAMES: Record<string, string> = ${JSON.stringify(
        Object.fromEntries(
          CATALOG_INGREDIENTS.map((entry) => [entry.id, entry.name]),
        ),
        null,
        2,
      )};\n`,
  },
];

const header = (src: string) =>
  `// Generated from ${src} by ${SCRIPT}. Do not edit; run npm run connections:vendor.\n`;

const rewriteImports = (text: string, rewrites: Record<string, string>) =>
  Object.entries(rewrites).reduce(
    (result, [from, to]) => result.replaceAll(`from '${from}'`, `from '${to}'`),
    text,
  );

const expected = [
  ...COPIES.map((copy) => ({
    dest: copy.dest,
    text:
      header(copy.src) +
      rewriteImports(
        readFileSync(resolve(ROOT, copy.src), 'utf8'),
        copy.importRewrites,
      ),
  })),
  ...GENERATED.map((entry) => ({
    dest: entry.dest,
    text: `${header(entry.src)}\n// prettier-ignore\n${entry.build()}`,
  })),
];

const isWrite = process.argv.includes('--write');

if (isWrite) {
  expected.forEach(({ dest, text }) => {
    mkdirSync(dirname(resolve(ROOT, dest)), { recursive: true });
    writeFileSync(resolve(ROOT, dest), text);
  });
  console.log(`Wrote ${expected.length} server copies.`);
} else {
  const stale = expected.filter(({ dest, text }) => {
    try {
      return readFileSync(resolve(ROOT, dest), 'utf8') !== text;
    } catch {
      return true;
    }
  });
  stale.forEach(({ dest }) =>
    console.error(`${dest} is out of date. Run npm run connections:vendor.`),
  );
  if (stale.length > 0) process.exit(1);
  console.log(`Server copies are current (${expected.length} files).`);
}
