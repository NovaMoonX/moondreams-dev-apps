import type { Auth } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import type { Firestore } from 'firebase-admin/firestore';

import {
 FIXTURE_PASSWORD,
 FIXTURE_USERS,
} from '../../src/lib/dev/fixtureAccounts.ts';

export const SEED_PROJECT_ID = 'moondreams-dev-apps';
export { FIXTURE_PASSWORD, FIXTURE_USERS };

export type SeedScope =
  | 'all'
  | 'core'
  | 'worth-the-wait'
  | 'nine-lives'
  | 'waypoint';

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