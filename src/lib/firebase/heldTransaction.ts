import type { DocumentData, Transaction } from 'firebase/firestore';

import { auth } from '@/lib/firebase/config';
import { buildHolds } from '@/lib/firebase/heldHolds';
import {
  projectRecordedWrites,
  runRecordedTransaction,
  type RecordedReads,
  type RecordedWrite,
} from '@/lib/firebase/recordedTransaction';
import { watchWriteLanded } from '@/lib/firebase/syncWatchdog';
import { store } from '@/store';
import type { HeldActions } from '@/store/heldLists';
import { generateUuid } from '@/utils';

interface HeldTransactionOptions {
  /** Named in the watchdog's report when a change never reaches the lists. */
  feature: string;
  actions: HeldActions;
  readTarget: (
    segments: string[],
    scope: string | null,
  ) => { kind: string; id: string } | null;
  open: (kind: string, data: DocumentData) => DocumentData;
  /** True once no list still holds a write with this token. */
  isLanded: (token: string) => boolean;
}

/** Builds a runner for transactions whose changes to listed records show at once, go back if the write fails, and are watched until the listeners show them. */
export const createHeldTransaction =
  ({ feature, actions, readTarget, open, isLanded }: HeldTransactionOptions) =>
  async <T>(
    scope: string | null,
    body: (transaction: Transaction) => Promise<T>,
  ): Promise<T> => {
    const token = generateUuid();
    const startedAs = auth.currentUser?.uid;
    const hold = async (writes: RecordedWrite[], reads: RecordedReads) => {
      const projected = await projectRecordedWrites(writes, reads).catch(
        () => null,
      );
      const built =
        projected === null
          ? null
          : buildHolds(
              projected,
              (segments) => readTarget(segments, scope),
              token,
              open,
            );
      if (
        built === null ||
        startedAs === undefined ||
        auth.currentUser?.uid !== startedAs
      ) {
        store.dispatch(actions.drop(token));
        return;
      }
      store.dispatch(actions.hold({ token, scope, writes: built }));
    };
    try {
      const result = await runRecordedTransaction(body, hold);
      store.dispatch(actions.settle(token));
      void watchWriteLanded({
        feature,
        what: 'a change you made',
        hasLanded: () => isLanded(token),
      });
      return result;
    } catch (error) {
      store.dispatch(actions.drop(token));
      throw error;
    }
  };
