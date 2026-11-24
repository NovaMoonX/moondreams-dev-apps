import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  deleteDoc,
  doc,
  runTransaction,
  type Transaction,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { runHeldTransaction } from '@apps/a-list/store/actions/heldTransaction';
import type { AListEmailEvent, AListEmailProgress } from '@apps/a-list/types';
import { getEmailHandledAt } from '@apps/a-list/utils/emailEvents';
import {
  cancelTrailerReminder,
  isTrailerReminderAhead,
  newTrailerReminderId,
  scheduleTrailerReminder,
} from '@apps/a-list/utils/reminders';

const rotateCallable = httpsCallable<
  Record<string, never>,
  { address: string }
>(functions, 'rotateAListEmailAddress');

const memberRef = (uid: string, ...path: string[]) =>
  doc(db, 'apps', 'a-list', 'memberships', uid, ...path);

const progressRef = (uid: string) => memberRef(uid, 'emailSetup', 'progress');

/** Makes the forwarding address, or replaces it (the old one stops working at once). Resolves with the new address. */
export async function rotateEmailAddress(): Promise<string> {
  const response = await rotateCallable({});
  return response.data.address;
}

export async function deleteEmailEvent(uid: string, eventId: string) {
  await deleteDoc(memberRef(uid, 'emailEvents', eventId));
}

/** Writes from what is stored now, so a second device never rewinds it; `decide` returns null to write nothing. */
async function writeProgress(
  uid: string,
  decide: (
    current: AListEmailProgress | null,
  ) => Pick<AListEmailProgress, 'noticeSeenThrough'> | null,
) {
  const ref = progressRef(uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? (snapshot.data() as AListEmailProgress)
      : null;
    const change = decide(current);
    if (change === null) return;
    const now = Date.now();
    transaction.set(ref, {
      id: 'progress',
      createdAt: current?.createdAt ?? now,
      ...change,
      updatedAt: now,
    } satisfies AListEmailProgress);
  });
}

/** Records that the person has been told about email changes up to `receivedAt` (a server time), never moving it back. */
export function markEmailChangesSeen(uid: string, receivedAt: number) {
  return writeProgress(uid, (current) =>
    (current?.noticeSeenThrough ?? 0) >= receivedAt
      ? null
      : { noticeSeenThrough: receivedAt },
  );
}

export type UndoResult =
  'restored' | 'alreadyBack' | 'removed' | 'cleared' | 'gone' | 'movedOn';

const markUndone = (transaction: Transaction, uid: string, eventId: string) =>
  transaction.update(memberRef(uid, 'emailEvents', eventId), {
    undoneAt: Date.now(),
  });

interface UndoEmailInput {
  uid: string;
  event: AListEmailEvent;
}

/** Reverses what one email did to the calendar and marks the email undone, so Undo is never offered twice. */
export const undoEmailEvent = createAsyncThunk<
  UndoResult,
  UndoEmailInput,
  { rejectValue: string }
>('aList/email/undo', async ({ uid, event }, { rejectWithValue }) => {
  try {
    const viewingId = event.viewingId ?? event.removedViewing?.id ?? null;
    if (viewingId === null) throw new Error('There is nothing to undo here.');
    const viewingRef = memberRef(uid, 'viewings', viewingId);
    const eventSnapshotRef = memberRef(uid, 'emailEvents', event.id);
    const restoredReminderId = event.removedViewing
      ? newTrailerReminderId(event.removedViewing.showtimeAt)
      : null;

    const outcome = await runHeldTransaction(
      uid,
      async (
        transaction,
      ): Promise<{
        result: UndoResult;
        reminder: string | null;
        showtimeAt: number;
        priorReminderId?: string | null;
      }> => {
        const eventSnapshot = await transaction.get(eventSnapshotRef);
        if (!eventSnapshot.exists()) throw new Error('This email is gone.');
        if (eventSnapshot.get('undoneAt') != null) {
          throw new Error('This was already undone.');
        }
        const viewingSnapshot = await transaction.get(viewingRef);
        const stored = viewingSnapshot.exists() ? viewingSnapshot.data() : null;
        const watchSnapshot =
          event.outcome === 'added' && event.watchlistKey !== null
            ? await transaction.get(
                memberRef(uid, 'watchlist', event.watchlistKey),
              )
            : null;
        const handledAt = getEmailHandledAt(event);

        if (event.outcome === 'canceled') {
          const removed = event.removedViewing;
          if (removed === null)
            throw new Error('There is nothing to put back.');
          markUndone(transaction, uid, event.id);
          if (stored !== null) {
            return {
              result: 'alreadyBack',
              reminder: null,
              showtimeAt: removed.showtimeAt,
            };
          }
          transaction.set(viewingRef, {
            ...removed,
            trailerReminderId: restoredReminderId,
            lastEditedAt: Date.now(),
          });
          return {
            result: 'restored',
            reminder: null,
            showtimeAt: removed.showtimeAt,
          };
        }

        if (stored === null) {
          markUndone(transaction, uid, event.id);
          return { result: 'gone', reminder: null, showtimeAt: 0 };
        }
        // The server stamps `lastEditedAt` with the instant it handled the email, so anything later is the member's.
        if (
          stored.emailEventId !== event.id ||
          stored.lastEditedAt > handledAt
        ) {
          return {
            result: 'movedOn',
            reminder: null,
            showtimeAt: stored.showtimeAt,
          };
        }
        markUndone(transaction, uid, event.id);
        if (event.outcome === 'added') {
          transaction.delete(viewingRef);
          if (
            watchSnapshot?.exists() &&
            watchSnapshot.get('lastEditedAt') <= handledAt &&
            watchSnapshot.get('archivedAt') == null
          ) {
            transaction.delete(watchSnapshot.ref);
          }
          return {
            result: 'removed',
            reminder: stored.trailerReminderId ?? null,
            showtimeAt: stored.showtimeAt,
          };
        }
        const prior = event.priorViewing;
        if (prior !== null) {
          const needsFreshReminder =
            prior.trailerReminderId != null &&
            stored.trailerReminderId == null &&
            isTrailerReminderAhead(prior.showtimeAt);
          const priorReminderId = needsFreshReminder
            ? newTrailerReminderId(prior.showtimeAt)
            : null;
          transaction.set(viewingRef, {
            ...prior,
            amcTicketCount: prior.amcTicketCount ?? null,
            amcRefundedOrders: prior.amcRefundedOrders ?? null,
            trailerReminderId:
              priorReminderId ?? stored.trailerReminderId ?? null,
            lastEditedAt: Date.now(),
          });
          return {
            result: 'cleared',
            reminder: null,
            showtimeAt: prior.showtimeAt,
            priorReminderId,
          };
        }
        transaction.update(viewingRef, {
          ticket: null,
          amcConfirmation: null,
          amcTicketCount: null,
          amcRefundedOrders: null,
          emailEventId: null,
          lastEditedAt: Date.now(),
        });
        return {
          result: 'cleared',
          reminder: null,
          showtimeAt: stored.showtimeAt,
        };
      },
    );

    if (
      outcome.result === 'removed' &&
      isTrailerReminderAhead(outcome.showtimeAt)
    ) {
      void cancelTrailerReminder(outcome.reminder);
    }
    const removed = event.removedViewing;
    const reinstated = outcome.result === 'restored' ? removed : null;
    const restoredPrior =
      outcome.result === 'cleared' ? event.priorViewing : null;
    const reminded = reinstated ?? restoredPrior;
    const reminderId = reinstated
      ? restoredReminderId
      : (outcome.priorReminderId ?? null);
    if (reminded !== null && reminderId) {
      void scheduleTrailerReminder({
        uid,
        reminderId,
        viewingId: reminded.id,
        movieTitle: reminded.movie.title,
        showtimeAt: reminded.showtimeAt,
      });
    }
    return outcome.result;
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to undo that. Try again in a moment.'),
    );
  }
});
