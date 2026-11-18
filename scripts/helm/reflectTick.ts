// One nightly-reflection pass against the emulators with a fake batch provider that has ended at once: `npm run helm:reflect-tick [-- --at <iso>]`. Emulators only.
// The functions' own copy of the SDK, so the sentinels the server code writes are the classes this client expects.
const fn = '../../functions/node_modules';
const { getApps, initializeApp } = await import(
  `${fn}/firebase-admin/lib/app/index.js`
);
const { getFirestore } = await import(
  `${fn}/firebase-admin/lib/firestore/index.js`
);

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'moondreams-dev-apps';
if (getApps().length === 0)
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const flag = process.argv.indexOf('--at');
const at = flag === -1 ? Date.now() : Date.parse(process.argv[flag + 1] ?? '');
if (Number.isNaN(at)) {
  console.error('--at needs an ISO instant, such as 2026-06-10T10:00:00Z.');
  process.exit(1);
}

const { runHelmReflectionPass } =
  await import('../../functions/src/apps/helm/reflection/runHelmReflection.ts');
const { createFakeBatchProvider } =
  await import('../../functions/src/ai/providers/fakeBatchProvider.ts');
const { DEV_KEYRING } = await import('../../functions/src/appKeys/keyring.ts');

const firestore = getFirestore();
const client = createFakeBatchProvider(
  Array.from({ length: 2000 }, () => ({
    type: 'answer' as const,
    json: { candidates: [], whyRefresh: [], noteObservations: [] },
  })),
);

console.log(`As of ${new Date(at).toISOString()}`);
console.log(
  'send   ',
  await runHelmReflectionPass(firestore, client, DEV_KEYRING, at),
);
console.log(
  'collect',
  await runHelmReflectionPass(firestore, client, DEV_KEYRING, at + 60_000),
);
console.log(
  `batches sent: ${client.created.length}, deleted: ${client.deleted.length}`,
);
process.exit(0);
