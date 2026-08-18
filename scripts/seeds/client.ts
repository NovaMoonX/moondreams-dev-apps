import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

import { SEED_PROJECT_ID, type SeedContext } from './types.ts';

const REQUIRED_EMULATORS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_DATABASE_EMULATOR_HOST',
] as const;

function isLocalEmulatorHost(host: string) {
  const hostname = host.split(':')[0];
  const result = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  return result;
}

export function assertLocalEmulators() {
  const invalidHosts = REQUIRED_EMULATORS.flatMap((name) => {
    const value = process.env[name];

    if (!value || !isLocalEmulatorHost(value)) {
      return name;
    }

    return [];
  });

  if (invalidHosts.length > 0) {
    throw new Error(
      `Seeding is restricted to local Firebase emulators. Set local values for: ${invalidHosts.join(', ')}.`,
    );
  }
}

export function createSeedContext(now = Date.now()): SeedContext {
  assertLocalEmulators();

  const projectId = process.env.GCLOUD_PROJECT ?? SEED_PROJECT_ID;
  const app =
    getApps()[0] ??
    initializeApp({
      projectId,
      databaseURL: `http://127.0.0.1:9000?ns=${projectId}-default-rtdb`,
    });

  const context: SeedContext = {
    auth: getAuth(app),
    database: getDatabase(app),
    firestore: getFirestore(app),
    now,
  };

  return context;
}

export async function resetEmulatorData(context: SeedContext) {
  await context.database.ref().set(null);

  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT ?? SEED_PROJECT_ID;
  const response = await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    throw new Error(`Could not clear Firestore emulator data: ${response.statusText}`);
  }

  let nextPageToken: string | undefined;

  do {
    const page = await context.auth.listUsers(1000, nextPageToken);
    const userIds = page.users.map((user) => user.uid);

    if (userIds.length > 0) {
      await context.auth.deleteUsers(userIds);
    }

    nextPageToken = page.pageToken;
  } while (nextPageToken);
}