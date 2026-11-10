import {
  collection,
  deleteField,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  type FieldValue,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { generateUuid } from '@/utils';
import { HELM_COPY } from '@apps/helm/constants';
import { planDay, type PlannerResult } from '@apps/helm/engine/planner';
import { sealJson } from '@apps/helm/security';
import type {
  Execution,
  ExecutionSealed,
  HelmEncryption,
  PlanDay,
  PlanDaySealed,
  PlanSlot,
} from '@apps/helm/types';
import { isDecided } from '@apps/helm/utils/planDays';
import type { buildPlanInput } from '@apps/helm/utils/planInput';

const planDaysOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'planDays');

const executionsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'executions');

/** One execution per planned day, so deciding the last slot can find it without a link stored on the day. */
const getExecutionId = (dayKey: string) => `plan-${dayKey}`;

const makeSlotId = () => generateUuid().replace(/-/g, '').slice(0, 12);

const toDate = (dayKey: string) => Date.parse(dayKey);

const slotPath = (slotId: string, field: keyof PlanSlot) =>
  `slots.${slotId}.${field}`;

const ignoreMissing = (error: unknown) => {
  if ((error as { code?: unknown } | null)?.code !== 'not-found') {
    console.error('Helm plan execution was not updated', error);
  }
};

/** Marks the day's plan done once every slot left on it is decided, `changes` being the statuses the store hasn't caught up with yet. A day that never had a plan made here has no execution, which is fine. */
function settleExecution(
  uid: string,
  dayKey: string,
  changes: Record<string, PlanSlot['status'] | null>,
) {
  const slots = store.getState().helm.planDays.byId[dayKey]?.slots ?? {};
  const remaining = Object.entries(slots).flatMap(([id, slot]) => {
    const change = changes[id];
    return change === null ? [] : [{ ...slot, status: change ?? slot.status }];
  });
  const now = Date.now();
  return updateDoc(
    doc(executionsOf(uid), getExecutionId(dayKey)),
    remaining.every(isDecided)
      ? { state: 'succeeded', decidedAt: now, finishedAt: now }
      : { state: 'proposed', decidedAt: null, finishedAt: null },
  ).catch(ignoreMissing);
}

/** Runs the planner for one day and writes its slots, reasons, calendar snapshot and one proposed execution in one batch. Kept and Not today slots stay as they were. */
export async function generatePlan(
  uid: string,
  encryption: HelmEncryption,
  plan: ReturnType<typeof buildPlanInput>,
  existing: PlanDay | undefined,
  dayLabel: string,
): Promise<PlannerResult> {
  const { input, calendarSnapshot, calendarReadAt } = plan;
  const result = planDay(input, makeSlotId);
  const now = Date.now();
  const removed = Object.keys(input.slots).filter(
    (id) => !(id in result.slots),
  );
  const slots: Record<string, PlanSlot | FieldValue> = {
    ...result.slots,
    ...Object.fromEntries(removed.map((id) => [id, deleteField()])),
  };
  const reasons = Object.fromEntries(
    Object.entries({ ...existing?.reasons, ...result.reasons }).filter(
      ([id]) => id in result.slots,
    ),
  );
  const suggested = Object.values(result.slots).filter(
    (slot) => slot.status === 'suggested',
  ).length;
  const sealed = await sealJson<PlanDaySealed>(
    { reasons, calendarSnapshot },
    encryption,
  );
  const batch = writeBatch(db);
  batch.set(
    doc(planDaysOf(uid), input.dayKey),
    {
      date: toDate(input.dayKey),
      slots,
      isRestDay: existing?.isRestDay ?? false,
      restDayOverriddenAt: existing?.restDayOverriddenAt ?? null,
      generatedAt: now,
      calendarReadAt,
      sealed,
    },
    { merge: true },
  );
  if (suggested > 0) {
    const execution: Execution = {
      captureId: null,
      actor: 'nomos',
      category: 'plan',
      autonomyLevel: 1,
      state: 'proposed',
      effectRefs: [],
      undoesExecutionId: null,
      undoneByExecutionId: null,
      questionRef: null,
      errorCode: null,
      createdAt: now,
      decidedAt: null,
      finishedAt: null,
      sealed: await sealJson<ExecutionSealed>(
        {
          summary: HELM_COPY.planSuggestedSummary(suggested, dayLabel),
          commands: [],
          effects: [],
          undoReport: null,
          spoken: null,
          goneIds: null,
        },
        encryption,
      ),
    };
    batch.set(doc(executionsOf(uid), getExecutionId(input.dayKey)), execution);
  }
  await batch.commit();
  return result;
}

const decide = (
  uid: string,
  dayKey: string,
  slotId: string,
  status: 'kept' | 'notToday' | 'suggested',
) =>
  updateDoc(doc(planDaysOf(uid), dayKey), {
    [slotPath(slotId, 'status')]: status,
    [slotPath(slotId, 'decidedAt')]: status === 'suggested' ? null : Date.now(),
  }).then(() => settleExecution(uid, dayKey, { [slotId]: status }));

export const keepSlot = (uid: string, dayKey: string, slotId: string) =>
  decide(uid, dayKey, slotId, 'kept');

/** "Not today": the task goes back to "Any time". */
export const skipSlot = (uid: string, dayKey: string, slotId: string) =>
  decide(uid, dayKey, slotId, 'notToday');

export const restoreSlot = (uid: string, dayKey: string, slotId: string) =>
  decide(uid, dayKey, slotId, 'suggested');

export interface SlotMove {
  fromKey: string;
  toKey: string;
  slotId: string;
  slot: PlanSlot;
  /** Both null puts it on the day with no time. */
  startAt: number | null;
  endAt: number | null;
}

/** "Another time": a slot of the person's choosing on this day or another, kept. Moving to another day is one batch, so the task is never on two days or none. */
export async function moveSlot(uid: string, move: SlotMove) {
  const { fromKey, toKey, slotId, slot, startAt, endAt } = move;
  const decidedAt = Date.now();
  if (fromKey === toKey) {
    await updateDoc(doc(planDaysOf(uid), fromKey), {
      [slotPath(slotId, 'startAt')]: startAt,
      [slotPath(slotId, 'endAt')]: endAt,
      [slotPath(slotId, 'status')]: 'kept',
      [slotPath(slotId, 'source')]: 'person',
      [slotPath(slotId, 'decidedAt')]: decidedAt,
    });
    return settleExecution(uid, fromKey, { [slotId]: 'kept' });
  }
  const batch = writeBatch(db);
  batch.update(doc(planDaysOf(uid), fromKey), {
    [`slots.${slotId}`]: deleteField(),
  });
  batch.set(
    doc(planDaysOf(uid), toKey),
    {
      date: toDate(toKey),
      slots: {
        [slotId]: {
          ...slot,
          startAt,
          endAt,
          status: 'kept',
          source: 'person',
          decidedAt,
        },
      },
    },
    { merge: true },
  );
  await batch.commit();
  return settleExecution(uid, fromKey, { [slotId]: null });
}

/** Keeps a task on a day at a time found for it (or with none), made from the task's own sheet. The write is handed back unawaited so it works offline. */
export function addKeptSlot(
  uid: string,
  dayKey: string,
  input: {
    taskId: string;
    startAt: number | null;
    endAt: number | null;
    source: PlanSlot['source'];
  },
) {
  const slot: PlanSlot = {
    ...input,
    status: 'kept',
    decidedAt: Date.now(),
  };
  return setDoc(
    doc(planDaysOf(uid), dayKey),
    { date: toDate(dayKey), slots: { [makeSlotId()]: slot } },
    { merge: true },
  );
}

/** "Bring to today": a task left undone on a past day is kept on today with no time; the past day stays as it was. */
export const bringToToday = (uid: string, todayKey: string, taskId: string) =>
  addKeptSlot(uid, todayKey, {
    taskId,
    startAt: null,
    endAt: null,
    source: 'person',
  });
