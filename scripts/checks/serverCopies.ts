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
    src: 'src/apps/a-list/types.ts',
    dest: 'functions/src/apps/a-list/share/aListTypes.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/a-list/utils/billing.ts',
    dest: 'functions/src/apps/a-list/share/billing.ts',
    importRewrites: { '@apps/a-list/types': './aListTypes.js' },
  },
  {
    src: 'src/apps/a-list/utils/savings.ts',
    dest: 'functions/src/apps/a-list/share/savings.ts',
    importRewrites: {
      '@apps/a-list/types': './aListTypes.js',
      '@apps/a-list/utils/billing': './billing.js',
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
    src: 'src/apps/waypoint/share/manifest.ts',
    dest: 'functions/src/apps/waypoint/share/manifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/apps/runway/share/manifest.ts',
    dest: 'functions/src/apps/runway/share/manifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/apps/worth-the-wait/share/manifest.ts',
    dest: 'functions/src/apps/worth-the-wait/share/manifest.ts',
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
  {
    src: 'src/lib/connections/google/gmailManifest.ts',
    dest: 'functions/src/connections/google/gmailManifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/lib/connections/google/driveManifest.ts',
    dest: 'functions/src/connections/google/driveManifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/lib/connections/google/contactsManifest.ts',
    dest: 'functions/src/connections/google/contactsManifest.ts',
    importRewrites: {
      '@/lib/connections/contract': '../../vendor/connectionsContract.js',
    },
  },
  {
    src: 'src/utils/stringUtils.ts',
    dest: 'functions/src/vendor/stringUtils.ts',
    importRewrites: {},
  },
  {
    src: 'src/utils/proseUtils.ts',
    dest: 'functions/src/vendor/proseUtils.ts',
    importRewrites: {},
  },
  {
    src: 'src/lib/speech/soundAlike.ts',
    dest: 'functions/src/vendor/soundAlike.ts',
    importRewrites: { '@/utils/optionMatchUtils': './optionMatchUtils.js' },
  },
  {
    src: 'src/utils/optionMatchUtils.ts',
    dest: 'functions/src/vendor/optionMatchUtils.ts',
    importRewrites: { '@/utils/stringUtils': './stringUtils.js' },
  },
  {
    src: 'src/apps/helm/engine/importance.ts',
    dest: 'functions/src/apps/helm/nomos/importanceOrder.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/research.ts',
    dest: 'functions/src/apps/helm/nomos/research.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/questionsTask.ts',
    dest: 'functions/src/apps/helm/nomos/questionsTask.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/seenAs.ts',
    dest: 'functions/src/apps/helm/nomos/seenAs.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/personality.ts',
    dest: 'functions/src/apps/helm/nomos/personality.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/researchAhead.ts',
    dest: 'functions/src/apps/helm/nomos/researchAhead.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/whoTier.ts',
    dest: 'functions/src/apps/helm/nomos/whoTier.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/contactPoints.ts',
    dest: 'functions/src/apps/helm/nomos/contactPoints.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/kinKinds.ts',
    dest: 'functions/src/apps/helm/nomos/kinKinds.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/connections.ts',
    dest: 'functions/src/apps/helm/nomos/connections.ts',
    importRewrites: { '@apps/helm/engine/kinKinds': './kinKinds.js' },
  },
  {
    src: 'src/apps/helm/engine/kin.ts',
    dest: 'functions/src/apps/helm/nomos/kin.ts',
    importRewrites: { '@apps/helm/engine/kinKinds': './kinKinds.js' },
  },
  {
    src: 'src/apps/helm/utils/keyDateIndex.ts',
    dest: 'functions/src/apps/helm/keyDateIndex.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/utils/topicTree.ts',
    dest: 'functions/src/apps/helm/topicTree.ts',
    importRewrites: { '@apps/helm/constants': './topicLimits.js' },
  },
  {
    src: 'src/apps/helm/utils/stepGroups.ts',
    dest: 'functions/src/apps/helm/stepGroups.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/utils/undoUnits.ts',
    dest: 'functions/src/apps/helm/undoUnits.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/utils/assistantName.ts',
    dest: 'functions/src/apps/helm/assistantName.ts',
    importRewrites: {},
  },
  {
    src: 'src/utils/naturalDateUtils.ts',
    dest: 'functions/src/apps/helm/naturalDate.ts',
    importRewrites: {
      '@/utils/timezoneUtils': '../../notifications/zonedTime.js',
    },
  },
  {
    src: 'src/apps/helm/utils/dateReading.ts',
    dest: 'functions/src/apps/helm/dateReading.ts',
    importRewrites: {
      '@/utils/naturalDateUtils': './naturalDate.js',
      '@apps/helm/types': './nomos/commands.js',
    },
  },
  {
    src: 'src/apps/helm/utils/mediaCaps.ts',
    dest: 'functions/src/apps/helm/media/mediaCaps.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/whereThingsLive.ts',
    dest: 'functions/src/apps/helm/nomos/whereThingsLive.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/utils/goalWhy.ts',
    dest: 'functions/src/apps/helm/goalWhy.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/utils/privacy.ts',
    dest: 'functions/src/apps/helm/privacy.ts',
    importRewrites: {
      '@/utils/optionMatchUtils': '../../vendor/optionMatchUtils.js',
    },
  },
  {
    src: 'src/lib/speech/speechText.ts',
    dest: 'functions/src/vendor/speechText.ts',
    importRewrites: { './soundAlike': './soundAlike.js' },
  },
  {
    src: 'src/lib/speech/closingPhrase.ts',
    dest: 'functions/src/vendor/closingPhrase.ts',
    importRewrites: { '@/lib/speech/speechText': './speechText.js' },
  },
  {
    src: 'src/apps/helm/engine/whereabouts.ts',
    dest: 'functions/src/apps/helm/nomos/whereabouts.ts',
    importRewrites: {},
  },
  {
    src: 'src/utils/repeatRule.ts',
    dest: 'functions/src/vendor/repeatRule.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/scheduledActions.ts',
    dest: 'functions/src/apps/helm/nomos/scheduledActions.ts',
    importRewrites: {
      '@/utils/cadenceUtils': '../../../vendor/cadenceUtils.js',
      '@/utils/repeatRule': '../../../vendor/repeatRule.js',
      '@/utils/timezoneUtils': '../../../notifications/zonedTime.js',
    },
  },
  {
    src: 'src/apps/helm/engine/freeTime.ts',
    dest: 'functions/src/apps/helm/nomos/freeTime.ts',
    importRewrites: {
      '@/utils/cadenceUtils': '../../../vendor/cadenceUtils.js',
      '@/utils/timezoneUtils': '../../../notifications/zonedTime.js',
    },
  },
  {
    src: 'src/utils/yearlyDateUtils.ts',
    dest: 'functions/src/vendor/yearlyDateUtils.ts',
    importRewrites: {},
  },
  {
    src: 'src/utils/cadenceUtils.ts',
    dest: 'functions/src/vendor/cadenceUtils.ts',
    importRewrites: {},
  },
  {
    src: 'src/apps/helm/engine/habitDay.ts',
    dest: 'functions/src/apps/helm/nomos/habitDay.ts',
    importRewrites: {
      '@/utils/cadenceUtils': '../../../vendor/cadenceUtils.js',
      '@/utils/timezoneUtils': '../../../notifications/zonedTime.js',
      '@apps/helm/engine/whereabouts': './whereabouts.js',
    },
  },
  {
    src: 'src/apps/helm/engine/habitLife.ts',
    dest: 'functions/src/apps/helm/nomos/habitLife.ts',
    importRewrites: {
      '@/utils/cadenceUtils': '../../../vendor/cadenceUtils.js',
      '@/utils/timezoneUtils': '../../../notifications/zonedTime.js',
      '@apps/helm/engine/habitDay': './habitDay.js',
    },
  },
  {
    src: 'src/apps/helm/engine/habitReminders.ts',
    dest: 'functions/src/apps/helm/nomos/habitReminders.ts',
    importRewrites: {
      '@/utils/cadenceUtils': '../../../vendor/cadenceUtils.js',
      '@/utils/timezoneUtils': '../../../notifications/zonedTime.js',
      '@apps/helm/engine/habitDay': './habitDay.js',
      '@apps/helm/engine/habitLife': './habitLife.js',
    },
  },
  {
    src: 'src/apps/helm/engine/said.ts',
    dest: 'functions/src/apps/helm/nomos/said.ts',
    importRewrites: { '@apps/helm/utils/privacy': '../privacy.js' },
  },
  {
    src: 'src/apps/helm/engine/checkInMatch.ts',
    dest: 'functions/src/apps/helm/nomos/checkInMatch.ts',
    importRewrites: {
      '@/utils/optionMatchUtils': '../../../vendor/optionMatchUtils.js',
      '@apps/helm/engine/habitDay': './habitDay.js',
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
