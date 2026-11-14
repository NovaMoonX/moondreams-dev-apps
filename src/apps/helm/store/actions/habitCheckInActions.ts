import { collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { sealJson } from '@apps/helm/security';
import {
  untallyHabit,
  untickHabit,
} from '@apps/helm/store/actions/habitDayWrites';
import type { CheckInEffect } from '@apps/helm/engine/checkInMatch';
import type {
  Execution,
  ExecutionSealed,
  HabitCheck,
  HelmEncryption,
} from '@apps/helm/types';
import {
  buildCheckPatch,
  buildTallyPatch,
} from '@apps/helm/utils/habitDayPatch';

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** The execution a check-in made on the device is recorded with: nothing it did is something Activity's Undo can plan, so it has no effect refs and its Undo is the line it was said on. */
const toExecution = async (
  summary: string,
  spoken: string | null,
  at: number,
  encryption: HelmEncryption,
  isPrivate: boolean,
): Promise<Execution> => ({
  captureId: null,
  actor: 'person',
  category: 'organize',
  autonomyLevel: 1,
  state: 'succeeded',
  effectRefs: [],
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  questionRef: null,
  errorCode: null,
  privacy: isPrivate ? 'private' : 'ordinary',
  createdAt: at,
  decidedAt: at,
  finishedAt: at,
  sealed: await sealJson<ExecutionSealed>(
    {
      summary,
      commands: [],
      effects: [],
      undoReport: null,
      spoken,
      goneIds: null,
      said: null,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    encryption,
  ),
});

/** Writes a tick or a tally the device read from a typed or said line, and the execution that records it, in one batch so it works offline. `encryption` is null when the key is not at hand: the check is still written, without an execution. */
export async function writeDeviceCheckIn(
  uid: string,
  effect: CheckInEffect,
  input: {
    summary: string;
    spoken: string | null;
    encryption: HelmEncryption | null;
    isPrivate: boolean;
  },
) {
  const batch = writeBatch(db);
  const executionRef = doc(collection(userOf(uid), 'executions'));
  const dayRef = doc(collection(userOf(uid), 'habitDays'), effect.dayKey);
  const hasExecution = input.encryption !== null;
  if (effect.kind === 'tick') {
    const check: HabitCheck = {
      status: 'done',
      at: effect.at,
      by: 'person',
      executionId: hasExecution ? executionRef.id : null,
    };
    batch.set(
      dayRef,
      buildCheckPatch(effect.dayKey, effect.habitId, effect.windowId, check),
      { merge: true },
    );
  } else {
    batch.set(
      dayRef,
      buildTallyPatch(effect.dayKey, effect.habitId, effect.at),
      { merge: true },
    );
  }
  if (input.encryption) {
    batch.set(
      executionRef,
      await toExecution(
        input.summary,
        input.spoken,
        effect.at,
        input.encryption,
        input.isPrivate,
      ),
    );
  }
  return {
    committed: batch.commit(),
    undo: () =>
      effect.kind === 'tick'
        ? untickHabit(uid, effect.dayKey, effect.habitId, effect.windowId)
        : untallyHabit(uid, effect.dayKey, effect.habitId),
  };
}
