import type { Firestore } from 'firebase-admin/firestore';
import type { SecretParam } from 'firebase-functions/params';

import type { SharedRecord } from '../vendor/connectionsContract.js';

export interface WritePageArgs {
  grantId: string;
  connectorId: string;
  accountId: string;
  category: string;
  records: SharedRecord[];
  isFull: boolean;
  windowStart: number;
  now: number;
  deepLink: (sourceRef: string) => string | null;
}

export interface FinishCategoryArgs {
  grantId: string;
  category: string;
  isFull: boolean;
  windowStart: number;
  now: number;
}

/** What is left of a category's copies after a run: all of them, and the ones kept from an ended connection. */
export interface CategoryTotals {
  count: number;
  keptCount: number;
}

export interface ExpiredGrant {
  uid: string;
  grantId: string;
  remainingKept: number;
}

/** One person's copies for one run; the key is unwrapped on the first write and never leaves it. */
export interface SinkSession {
  writePage(args: WritePageArgs): Promise<void>;
  /** Drops what this run did not see (a full read only) and what ended more than the window ago. */
  finishCategory(args: FinishCategoryArgs): Promise<CategoryTotals>;
  deleteCategory(grantId: string, category: string): Promise<number>;
  deleteGrant(grantId: string): Promise<number>;
  deleteKept(grantId: string): Promise<number>;
  /** How many copies of the connection are kept after it ended, whichever category they sit in. */
  countKept(grantId: string): Promise<number>;
  keepGrant(
    grantId: string,
    endedAt: number,
    deleteAfter: number,
  ): Promise<number>;
}

/** Where a reader app keeps the copies it makes of what another app shares. */
export interface ReaderSink {
  keptCopyDays: number;
  secrets: SecretParam[];
  openSession(firestore: Firestore, uid: string): SinkSession;
  /** Deletes every copy whose `deleteAfter` has come, for everyone. */
  expire(firestore: Firestore, now: number): Promise<ExpiredGrant[]>;
}
