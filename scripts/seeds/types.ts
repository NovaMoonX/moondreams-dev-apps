import type { Auth } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import type { Firestore } from 'firebase-admin/firestore';

export const SEED_PROJECT_ID = 'moondreams-dev-apps';

export const FIXTURE_PASSWORD = 'local-fixture-password';

export const FIXTURE_USERS = {
  admin: {
    uid: 'seed-admin',
    email: 'nova@moondreams.dev',
    displayName: 'Nova Admin',
  },
  partnerOne: {
    uid: 'seed-worth-the-wait-one',
    email: 'alex@example.test',
    displayName: 'Alex Rivera',
  },
  partnerTwo: {
    uid: 'seed-worth-the-wait-two',
    email: 'jamie@example.test',
    displayName: 'Jamie Chen',
  },
} as const;

export type SeedScope = 'all' | 'core' | 'worth-the-wait';

export interface SeedContext {
  auth: Auth;
  database: Database;
  firestore: Firestore;
  now: number;
}

export interface SeedResult {
  authUsers: number;
  firestoreDocuments: number;
  realtimePaths: number;
}

export const EMPTY_SEED_RESULT: SeedResult = {
  authUsers: 0,
  firestoreDocuments: 0,
  realtimePaths: 0,
};

export function combineSeedResults(...results: SeedResult[]): SeedResult {
  const result = results.reduce(
    (total, current) => ({
      authUsers: total.authUsers + current.authUsers,
      firestoreDocuments: total.firestoreDocuments + current.firestoreDocuments,
      realtimePaths: total.realtimePaths + current.realtimePaths,
    }),
    EMPTY_SEED_RESULT,
  );

  return result;
}