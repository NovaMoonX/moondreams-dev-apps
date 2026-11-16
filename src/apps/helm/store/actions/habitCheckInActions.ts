import { collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { EMPTY_READING } from '@apps/helm/utils/captureReading';
import { sealJson } from '@apps/helm/security';
import { store } from '@/store';
import { notifyRemindersBack } from '@apps/helm/utils/remindersBackNotice';
import {
  isMissingDay,
  markHabitDay,
  untallyHabit,
  untickHabit,
} from '@apps/helm/store/actions/habitDayWrites';
import type { CheckInEffect } from '@apps/helm/engine/checkInMatch';
import type {
  Capture,
  CaptureSealed,
  EffectRef,
  Execution,
  ExecutionEffect,
  ExecutionSealed,
  HabitCheck,
  HelmEncryption,
} from '@apps/helm/types';
import {
  buildCheckPatch,
  buildTallyPatch,
} from '@apps/helm/utils/habitDayPatch';

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** The execution a check-in made on the device is recorded with, holding the day's field it wrote and what it was before so Activity's Undo can take it back. */
const toExecution = async (
  captureId: string,
  summary: string,
  spoken: string | null,
  said: string | null,
  at: number,
  encryption: HelmEncryption,
  isPrivate: boolean,
  record: { refs: EffectRef[]; effects: ExecutionEffect[] },
): Promise<Execution> => ({
  captureId,
  actor: 'person',
  via: null,
  category: 'organize',
  autonomyLevel: 1,
  state: 'succeeded',
  effectRefs: record.refs,
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  undoneDocIds: null,
  partUndoIds: null,
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
      effects: record.effects,
      undoReport: null,
      spoken,
      goneIds: null,
      undoReason: null,
      said,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    encryption,
  ),
});

/** The turn a check-in is recorded as: sorted at once, holding its execution, with the person's words sealed like any turn's. */
const toCapture = async (
  executionId: string,
  input: {
    encryption: HelmEncryption | null;
    isPrivate: boolean;
    turn: {
      text: string;
      createdAt: number;
      sessionId: string;
      turnIndex: number;
      inputMode: 'typed' | 'voice';
      sttProvider: string | null;
      interruptedCaptureId: string | null;
      presence: Capture['presence'];
    };
  },
): Promise<Capture> => {
  const { turn } = input;
  return {
    inputMode: turn.inputMode,
    sttProvider: turn.sttProvider,
    interruptedCaptureId: turn.interruptedCaptureId,
    answersQuestion: null,
    ttsProvider: null,
    arrivedVia: 'direct',
    medium: 'web',
    via: null,
    outsideReadScopes: null,
    sessionId: turn.sessionId,
    turnIndex: turn.turnIndex,
    route: 'quick',
    status: 'sorted',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
    executionIds: [executionId],
    turnLeadId: null,
    joinedCaptureIds: [],
    attachmentIds: [],
    seenAt: turn.createdAt,
    dismissedAt: null,
    quotedSourceKeys: [],
    answerSavedNoteId: null,
    whoIds: [],
    placeIds: [],
    planDayKey: null,
    createdAt: turn.createdAt,
    sortedAt: turn.createdAt,
    screen: null,
    privacy: input.isPrivate ? 'private' : 'ordinary',
    touchesPrivate: input.isPrivate,
    presence: turn.presence,
    abilities: null,
    sealed: await sealJson<CaptureSealed>(
      {
        text: turn.text,
        reading: EMPTY_READING,
        answer: null,
        questionAnswer: null,
        heardNames: null,
      },
      input.encryption as HelmEncryption,
    ),
  };
};

/** Writes a tick or a tally the device read from a typed or said line, and the execution that records it, in one batch so it works offline. `encryption` is null when the key is not at hand: the check is still written, without an execution. */
export async function writeDeviceCheckIn(
  uid: string,
  effect: CheckInEffect,
  input: {
    summary: string;
    spoken: string | null;
    /** The line the thread shows until the first tap, when the turn was heard while nobody was looking; null otherwise. */
    said: string | null;
    encryption: HelmEncryption | null;
    isPrivate: boolean;
    habitName: string;
    isNewDay: boolean;
    /** The words and where they sit in the conversation: written as a sorted turn that holds the execution, so the thread shows the check-in like any other turn. */
    turn: {
      text: string;
      createdAt: number;
      sessionId: string;
      turnIndex: number;
      inputMode: 'typed' | 'voice';
      sttProvider: string | null;
      interruptedCaptureId: string | null;
      presence: Capture['presence'];
    };
  },
) {
  const batch = writeBatch(db);
  const executionRef = doc(collection(userOf(uid), 'executions'));
  const captureRef = doc(collection(userOf(uid), 'captures'));
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
  const isBack = markHabitDay(batch, uid, effect.dayKey, effect.habitId, true);
  if (input.encryption) {
    const path =
      effect.kind === 'tick'
        ? `entries.${effect.habitId}.checks.${effect.windowId}`
        : `entries.${effect.habitId}.count`;
    const title = { 'sealed.title': input.habitName };
    batch.set(captureRef, await toCapture(executionRef.id, input));
    batch.set(
      executionRef,
      await toExecution(
        captureRef.id,
        input.summary,
        input.spoken,
        input.said,
        effect.at,
        input.encryption,
        input.isPrivate,
        {
          refs: [
            {
              op: input.isNewDay ? 'create' : 'update',
              collection: 'habitDays',
              docId: effect.dayKey,
            },
          ],
          effects: [
            effect.kind === 'tick'
              ? {
                  written: {
                    [path]: {
                      status: 'done',
                      at: effect.at,
                      by: 'person',
                      executionId: executionRef.id,
                    },
                    noteKey: null,
                    ...title,
                  },
                  previous: { [path]: null, noteKey: null, ...title },
                }
              : {
                  written: { [path]: effect.count, ...title },
                  previous: { [path]: effect.count - 1, ...title },
                },
          ],
        },
      ),
    );
  }
  return {
    recorded: input.encryption
      ? { captureId: captureRef.id, executionId: executionRef.id }
      : null,
    committed: batch.commit().then(() => {
      if (isBack) notifyRemindersBack();
    }),
    undo: () =>
      effect.kind === 'tick'
        ? untickHabit(
            uid,
            effect.dayKey,
            effect.habitId,
            effect.windowId,
          ).catch((error: unknown) => {
            if (!isMissingDay(error)) throw error;
          })
        : untallyHabit(
            uid,
            effect.dayKey,
            effect.habitId,
            store.getState().helm.habitDays.byId[effect.dayKey]?.entries[
              effect.habitId
            ]?.count ?? 0,
          ),
  };
}
