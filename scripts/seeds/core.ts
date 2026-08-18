import { APP_REGISTRY } from '../../src/lib/app/app.registry.ts';

import {
  EMPTY_SEED_RESULT,
  FIXTURE_PASSWORD,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

async function upsertFixtureUser(
  context: SeedContext,
  fixture: (typeof FIXTURE_USERS)[keyof typeof FIXTURE_USERS],
  isAdmin: boolean,
) {
  try {
    await context.auth.updateUser(fixture.uid, {
      displayName: fixture.displayName,
      email: fixture.email,
      password: FIXTURE_PASSWORD,
    });
  } catch (error) {
    const firebaseError = error as { code?: string };

    if (firebaseError.code !== 'auth/user-not-found') {
      throw error;
    }

    await context.auth.createUser({
      uid: fixture.uid,
      displayName: fixture.displayName,
      email: fixture.email,
      password: FIXTURE_PASSWORD,
      emailVerified: true,
    });
  }

  await context.auth.setCustomUserClaims(fixture.uid, isAdmin ? { admin: true } : {});
}

export async function seedCore(context: SeedContext): Promise<SeedResult> {
  const fixtures = Object.values(FIXTURE_USERS);

  await Promise.all(
    fixtures.map((fixture) =>
      upsertFixtureUser(context, fixture, fixture.uid === FIXTURE_USERS.admin.uid),
    ),
  );

  const batch = context.firestore.batch();

  fixtures.forEach((fixture) => {
    const userRef = context.firestore.collection('users').doc(fixture.uid);
    batch.set(
      userRef,
      {
        uid: fixture.uid,
        email: fixture.email,
        displayName: fixture.displayName,
        photoURL: '',
        isAdmin: fixture.uid === FIXTURE_USERS.admin.uid,
      },
      { merge: true },
    );
  });

  APP_REGISTRY.forEach((app) => {
    const appRef = context.firestore.collection('apps').doc(app.id);
    const createdAt = app.createdAt
      ? new Date(app.createdAt).toISOString()
      : new Date(context.now).toISOString();

    batch.set(
      appRef,
      {
        id: app.id,
        name: app.name,
        description: app.description,
        path: app.path,
        isRestricted: false,
        allowedUsers: [],
        createdAt,
        updatedAt: new Date(context.now).toISOString(),
      },
      { merge: true },
    );
  });

  await batch.commit();

  const statuses = fixtures.map((fixture) => [
    `status/${fixture.uid}`,
    {
      state: 'online',
      currentLocation: fixture.uid === FIXTURE_USERS.admin.uid ? 'home' : 'worth-the-wait',
      lastChanges: context.now,
    },
  ]);
  const statusData = Object.fromEntries(statuses);
  await context.database.ref().update(statusData);

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    authUsers: fixtures.length,
    firestoreDocuments: fixtures.length + APP_REGISTRY.length,
    realtimePaths: fixtures.length,
  };

  return result;
}