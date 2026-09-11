import { createSeedContext, resetEmulatorData } from './seeds/client.ts';
import { seedCore } from './seeds/core.ts';
import {
  combineSeedResults,
  SEED_PROJECT_ID,
  type SeedScope,
} from './seeds/types.ts';
import { seedNineLives } from './seeds/nineLives.ts';
import { seedWorthTheWait } from './seeds/worthTheWait.ts';

function readScope(args: string[]): SeedScope {
  const scopeIndex = args.indexOf('--scope');
  const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : 'all';

  if (
    scope === 'all' ||
    scope === 'core' ||
    scope === 'worth-the-wait' ||
    scope === 'nine-lives'
  ) {
    return scope;
  }

  throw new Error('Use --scope all, core, worth-the-wait, or nine-lives.');
}

async function main() {
  const args = process.argv.slice(2);
  const scope = readScope(args);
  const shouldReset = args.includes('--reset');
  const context = createSeedContext();

  if (shouldReset) {
    await resetEmulatorData(context);
  }

  const results = [];

  if (
    scope === 'all' ||
    scope === 'core' ||
    scope === 'worth-the-wait' ||
    scope === 'nine-lives'
  ) {
    results.push(await seedCore(context));
  }

  if (scope === 'all' || scope === 'worth-the-wait') {
    results.push(await seedWorthTheWait(context));
  }

  if (scope === 'all' || scope === 'nine-lives') {
    results.push(await seedNineLives(context));
  }

  const result = combineSeedResults(...results);
  console.log(
    `Seeded ${scope} for ${SEED_PROJECT_ID}: ${result.authUsers} Auth users, ${result.firestoreDocuments} Firestore documents, ${result.realtimePaths} RTDB paths.`,
  );
}

try {
  await main();
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exit(1);
}