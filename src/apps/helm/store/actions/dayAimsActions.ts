import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { openJson, sealJson } from '@apps/helm/security';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  rankStoredNotes,
  sendCapture,
} from '@apps/helm/store/actions/captureActions';
import {
  recordSentTurn,
  clearSentTurn,
  getNextTurn,
} from '@apps/helm/hooks/useSession';
import type {
  DayAims,
  DayAimsSealed,
  HelmEncryption,
  Sealed,
  StruggleSignal,
} from '@apps/helm/types';
import {
  applyReadingEdits,
  readCapture,
} from '@apps/helm/utils/captureReading';

type WindDownEntry = DayAimsSealed['windDown'][string];
type Readable = Pick<DayAims, 'state' | 'windDownState'>;

/** What the device keeps of one write so its Undo can put back exactly that: an Undo that would overwrite a later change (a task's length changed since) does nothing. */
export interface DayAimsChange {
  write: Promise<void>;
  undo: () => Promise<void>;
}

const dayAimsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'dayAims');

const profileOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

const toDate = (dayKey: string) => Date.parse(dayKey);

// One day's writes run one after another, so a second tap reads what the first left (offline too, where the cache holds the first before the server does).
const lanes = new Map<string, Promise<unknown>>();
const inLane = <T>(key: string, run: () => Promise<T>): Promise<T> => {
  const next = (lanes.get(key) ?? Promise.resolve()).then(run, run);
  lanes.set(
    key,
    next.catch(() => undefined),
  );
  return next;
};

const emptyPayload: DayAimsSealed = { aims: [], windDown: {} };

async function readDay(
  uid: string,
  encryption: HelmEncryption,
  dayKey: string,
) {
  const ref = doc(dayAimsOf(uid), dayKey);
  const snapshot = await getDocFromCache(ref).catch(() => getDoc(ref));
  if (!snapshot.exists()) {
    return { exists: false, readable: null, payload: emptyPayload };
  }
  const data = snapshot.data() as Partial<DayAims> & { sealed?: Sealed };
  const opened = data.sealed
    ? await openJson<Partial<DayAimsSealed>>(data.sealed, encryption)
    : {};
  return {
    exists: true,
    readable: {
      state: data.state ?? 'open',
      windDownState: data.windDownState ?? 'waiting',
    } as Readable,
    payload: {
      aims: opened.aims ?? [],
      windDown: opened.windDown ?? {},
    },
  };
}

interface DayEdit {
  uid: string;
  dayKey: string;
  change: (payload: DayAimsSealed) => DayAimsSealed;
  readable?: Partial<Readable>;
  /** Other documents the same tap changes, in the same batch. */
  alongside?: (batch: WriteBatch) => void;
}

/** Re-reads the day, applies one change and writes the whole sealed payload with the profile's `dayAimsChangedAt` in one batch, so the server looks soon. The commit is handed back unawaited so it queues offline. */
function editDay(edit: DayEdit) {
  const { uid, dayKey, change, readable, alongside } = edit;
  return inLane(`${uid}|${dayKey}`, async () => {
    const encryption = await getHelmEncryption(uid);
    const before = await readDay(uid, encryption, dayKey);
    const sealed = await sealJson<DayAimsSealed>(
      change(before.payload),
      encryption,
    );
    const batch = writeBatch(db);
    const ref = doc(dayAimsOf(uid), dayKey);
    if (before.exists) {
      batch.update(ref, { sealed, ...readable });
    } else {
      batch.set(ref, {
        date: toDate(dayKey),
        state: 'open',
        windDownState: 'waiting',
        lookAt: null,
        rolledAt: null,
        ...readable,
        sealed,
      });
    }
    batch.update(profileOf(uid), { dayAimsChangedAt: Date.now() });
    alongside?.(batch);
    return {
      before,
      write: batch.commit(),
    };
  });
}

const withEntry = (
  payload: DayAimsSealed,
  taskId: string,
  entry: WindDownEntry | null,
): DayAimsSealed => ({
  ...payload,
  windDown:
    entry === null
      ? Object.fromEntries(
          Object.entries(payload.windDown).filter(([id]) => id !== taskId),
        )
      : { ...payload.windDown, [taskId]: entry },
});

/** "Bring to today": a task left undone yesterday becomes one of today's aims, marked as brought. */
export async function bringAimToToday(
  uid: string,
  input: {
    todayKey: string;
    fromKey: string;
    taskId: string;
    hasLength: boolean;
  },
): Promise<DayAimsChange> {
  const { todayKey, fromKey, taskId, hasLength } = input;
  const { write, before } = await editDay({
    uid,
    dayKey: todayKey,
    change: (payload) =>
      payload.aims.some((aim) => aim.taskId === taskId)
        ? payload
        : {
            ...payload,
            aims: [
              ...payload.aims,
              {
                aimId: generateUuid(),
                taskId,
                order:
                  payload.aims.reduce(
                    (top, aim) => Math.max(top, aim.order),
                    0,
                  ) + 1,
                lengthIsGuess: !hasLength,
                broughtFrom: fromKey,
              },
            ],
          },
  });
  if (before.payload.aims.some((aim) => aim.taskId === taskId)) {
    return { write, undo: async () => {} };
  }
  return {
    write,
    undo: async () => {
      await editDay({
        uid,
        dayKey: todayKey,
        change: (payload) => ({
          ...payload,
          aims: payload.aims.filter((aim) => aim.taskId !== taskId),
        }),
      });
    },
  };
}

/** "Not today" on something left from yesterday: yesterday's day records it as left for later, so the morning card stops listing it. The task is untouched. */
export async function leaveAimOffToday(
  uid: string,
  fromKey: string,
  taskId: string,
): Promise<DayAimsChange> {
  const { write, before } = await editDay({
    uid,
    dayKey: fromKey,
    change: (payload) =>
      withEntry(payload, taskId, {
        result: payload.windDown[taskId]?.result ?? 'wontHappen',
        choice: 'later',
        reason: payload.windDown[taskId]?.reason ?? null,
        saidSpanId: null,
      }),
  });
  const previous = before.payload.windDown[taskId] ?? null;
  return {
    write,
    undo: async () => {
      await editDay({
        uid,
        dayKey: fromKey,
        change: (payload) => withEntry(payload, taskId, previous),
      });
    },
  };
}

/** Sets the morning card's state for a day: dismissed, or open again. */
export async function setMorningState(
  uid: string,
  dayKey: string,
  state: DayAims['state'],
): Promise<DayAimsChange> {
  const { write, before } = await editDay({
    uid,
    dayKey,
    change: (payload) => payload,
    readable: { state },
  });
  const previous = before.readable?.state ?? 'open';
  return {
    write,
    undo: async () => {
      await editDay({
        uid,
        dayKey,
        change: (payload) => payload,
        readable: { state: previous },
      });
    },
  };
}

/** A guessed length fixed by the person: the minutes are written to the task, and the aim stops being a guess. Undo puts back the task's earlier length and the guess. */
export async function fixAimLength(
  uid: string,
  input: {
    dayKey: string;
    taskId: string;
    minutes: number;
    previousMinutes: number | null;
    wasGuess: boolean;
  },
): Promise<DayAimsChange> {
  const { dayKey, taskId, minutes, previousMinutes, wasGuess } = input;
  const setLength = (length: number | null, isGuess: boolean) =>
    editDay({
      uid,
      dayKey,
      change: (payload) => ({
        ...payload,
        aims: payload.aims.map((aim) =>
          aim.taskId === taskId ? { ...aim, lengthIsGuess: isGuess } : aim,
        ),
      }),
      alongside: (batch) =>
        batch.update(
          doc(collection(db, 'apps', 'helm', 'users', uid, 'tasks'), taskId),
          {
            durationMinutes: length,
            lastEditedAt: Date.now(),
          },
        ),
    });
  const { write } = await setLength(minutes, false);
  return {
    write,
    undo: async () => {
      const taskRef = doc(
        collection(db, 'apps', 'helm', 'users', uid, 'tasks'),
        taskId,
      );
      const current = await getDocFromCache(taskRef)
        .catch(() => getDoc(taskRef))
        .catch(() => null);
      if (current?.data()?.durationMinutes !== minutes) return;
      await setLength(previousMinutes, wasGuess);
    },
  };
}

/** A wind-down choice or reason for one aim; `result` is what the aim stood at when the person saw it. Undo puts the entry back as it was. */
export async function setWindDownEntry(
  uid: string,
  input: {
    dayKey: string;
    taskId: string;
    result: WindDownEntry['result'];
    choice?: WindDownEntry['choice'];
    reason?: StruggleSignal | null;
  },
): Promise<DayAimsChange> {
  const { dayKey, taskId, result } = input;
  const { write, before } = await editDay({
    uid,
    dayKey,
    change: (payload) => {
      const current = payload.windDown[taskId];
      return withEntry(payload, taskId, {
        result,
        choice:
          input.choice !== undefined ? input.choice : (current?.choice ?? null),
        reason:
          input.reason !== undefined ? input.reason : (current?.reason ?? null),
        saidSpanId:
          input.reason !== undefined ? null : (current?.saidSpanId ?? null),
      });
    },
  });
  const previous = before.payload.windDown[taskId] ?? null;
  return {
    write,
    undo: async () => {
      await editDay({
        uid,
        dayKey,
        change: (payload) => withEntry(payload, taskId, previous),
      });
    },
  };
}

/** "Done" on the wind-down: the day is wound down, and each aim's result as the person saw it is kept with it. Undo reopens the card and takes back the entries this wrote. */
export async function finishWindDown(
  uid: string,
  input: { dayKey: string; results: Record<string, WindDownEntry['result']> },
): Promise<DayAimsChange> {
  const { dayKey, results } = input;
  const { write, before } = await editDay({
    uid,
    dayKey,
    change: (payload) => ({
      ...payload,
      windDown: {
        ...Object.fromEntries(
          Object.entries(results).map(([taskId, result]) => [
            taskId,
            { result, choice: null, reason: null, saidSpanId: null },
          ]),
        ),
        ...payload.windDown,
      },
    }),
    readable: { windDownState: 'done' },
  });
  const previous = before.readable?.windDownState ?? 'ready';
  const added = Object.keys(results).filter(
    (taskId) => !(taskId in before.payload.windDown),
  );
  return {
    write,
    undo: async () => {
      await editDay({
        uid,
        dayKey,
        change: (payload) => ({
          ...payload,
          windDown: Object.fromEntries(
            Object.entries(payload.windDown).filter(
              ([taskId]) => !added.includes(taskId),
            ),
          ),
        }),
        readable: { windDownState: previous === 'done' ? 'ready' : previous },
      });
    },
  };
}

/** "Keep" on an aim that now overlaps an event: the slot stays where it is and the mark goes. Undo puts the mark back. */
export async function keepOverlappingSlot(
  uid: string,
  dayKey: string,
  slotId: string,
  eventRef: string,
): Promise<DayAimsChange> {
  const ref = doc(
    collection(db, 'apps', 'helm', 'users', uid, 'planDays'),
    dayKey,
  );
  const path = `slots.${slotId}.overlapsEventRef`;
  const write = updateDoc(ref, { [path]: null });
  return {
    write,
    undo: async () => {
      await updateDoc(ref, { [path]: eventRef });
    },
  };
}

/** Files what the person said or typed on the morning card, as a turn marked with the day; the server files the aims and writes the day in that turn. Handed back unawaited so it works offline. */
export async function fileAims(
  uid: string,
  input: { text: string; dayKey: string; assistantName: string },
) {
  const { helm } = store.getState();
  const timeZone = helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const next = { ...getNextTurn(), leadId: null, createdAt: Date.now() };
  const encryption = await getHelmEncryption(uid);
  const reading = applyReadingEdits(
    readCapture(input.text.trimStart(), {
      now: next.createdAt,
      timeZone,
      assistantName: input.assistantName,
    }),
    { dismissed: [], days: {}, timeZone },
  );
  const { write, id } = await sendCapture(uid, encryption, {
    text: input.text,
    reading,
    screen: null,
    answersQuestion: null,
    questionAnswer: null,
    noteIds: rankStoredNotes(input.text),
    aimsDayKey: input.dayKey,
    ...next,
  });
  recordSentTurn(uid, next, id);
  void write.catch(() => clearSentTurn(uid, id));
  return { write, id };
}
