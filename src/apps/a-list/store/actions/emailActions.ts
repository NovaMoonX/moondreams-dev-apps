import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  deleteDoc,
  doc,
  runTransaction,
  type Transaction,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import type { EmailSetupProgressChange } from '@/components/emailForwarding/EmailSetupWalkthrough';
import { db, functions } from '@/lib/firebase/config';
import type { EmailSetupProgress } from '@/lib/emailForwarding/types';
import { getErrorMessage } from '@/utils/errorUtils';
import { runHeldTransaction } from '@apps/a-list/store/actions/heldTransaction';
import type { AListEmailEvent } from '@apps/a-list/types';
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

/** Writes progress from what is stored now, so a second device never rewinds it; `decide` returns null to write nothing. */
async function writeProgress(
  uid: string,
  decide: (
    current: EmailSetupProgress | null,
  ) => Partial<
    Pick<EmailSetupProgress, 'provider' | 'stepId' | 'startedAt' | 'doneAt'>
  > | null,
) {
  const ref = progressRef(uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? (snapshot.data() as EmailSetupProgress)
      : null;
    const change = decide(current);
    if (change === null) return;
    const now = Date.now();
    transaction.set(ref, {
      id: 'progress',
      provider: current?.provider ?? null,
      stepId: current?.stepId ?? null,
      startedAt: current?.startedAt ?? null,
      doneAt: current?.doneAt ?? null,
      createdAt: current?.createdAt ?? now,
      ...change,
      updatedAt: now,
    } satisfies EmailSetupProgress);
  });
}

const STEP_ORDER = [
  'provider',
  'copy',
  'forwarding',
  'rule',
  'confirm',
  'filter',
  'test',
];

/** Saves the provider or the furthest step reached; `startedAt` (from server-written times) is kept once a walk has one. */
export function saveEmailProgress(
  uid: string,
  next: EmailSetupProgressChange,
  startedAt: number,
) {
  return writeProgress(uid, (current) => {
    const isSameProviderFurther =
      current !== null &&
      current.provider === next.provider &&
      current.stepId !== null &&
      next.stepId !== null &&
      STEP_ORDER.indexOf(current.stepId) > STEP_ORDER.indexOf(next.stepId);
    return {
      provider: next.provider,
      stepId: isSameProviderFurther ? current.stepId : next.stepId,
      startedAt: current?.startedAt ?? startedAt,
    };
  });
}

/** "Set it up again": a new walk that ticks only what arrives after `startedAt`. */
export function restartEmailSetup(uid: string, startedAt: number) {
  return writeProgress(uid, () => ({
    stepId: 'provider',
    startedAt,
    doneAt: null,
  }));
}

export function finishEmailSetup(uid: string) {
  return writeProgress(uid, (current) =>
    current?.doneAt != null ? null : { doneAt: Date.now() },
  );
}

export type UndoResult =
  'restored' | 'alreadyBack' | 'removed' | 'cleared' | 'gone';

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
      }> => {
        const eventSnapshot = await transaction.get(eventSnapshotRef);
        if (!eventSnapshot.exists()) throw new Error('This email is gone.');
        if (eventSnapshot.get('undoneAt') != null) {
          throw new Error('This was already undone.');
        }
        const viewingSnapshot = await transaction.get(viewingRef);
        const stored = viewingSnapshot.exists() ? viewingSnapshot.data() : null;

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

        markUndone(transaction, uid, event.id);
        if (stored === null) {
          return { result: 'gone', reminder: null, showtimeAt: 0 };
        }
        if (event.outcome === 'added') {
          transaction.delete(viewingRef);
          return {
            result: 'removed',
            reminder: stored.trailerReminderId ?? null,
            showtimeAt: stored.showtimeAt,
          };
        }
        transaction.update(viewingRef, {
          ticket: null,
          amcConfirmation: null,
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
    if (outcome.result === 'restored' && removed !== null) {
      if (restoredReminderId) {
        void scheduleTrailerReminder({
          uid,
          reminderId: restoredReminderId,
          viewingId: removed.id,
          movieTitle: removed.movie.title,
          showtimeAt: removed.showtimeAt,
        });
      }
    }
    return outcome.result;
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to undo that. Try again in a moment.'),
    );
  }
});
