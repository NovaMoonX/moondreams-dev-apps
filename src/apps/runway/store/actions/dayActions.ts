import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { CONFIRM_WORDS, CORRECT_WORDS } from '@apps/runway/constants';
import {
  buildRecords,
  countUnresolvedHolds,
  type ItemNames,
} from '@apps/runway/engine/confirm';
import {
  buildCorrection,
  getCorrectionId,
  keepTicks,
  type EffectiveSplit,
} from '@apps/runway/engine/correct';
import { toDayKey } from '@apps/runway/engine/dates';
import type { Draft } from '@apps/runway/engine/draft';
import { hashOverride } from '@apps/runway/engine/fingerprint';
import { openJson, sealJson } from '@apps/runway/security';
import type {
  Cents,
  DateOnly,
  DayOverrideSealed,
  DayRecordDoc,
  DayStatus,
  IncomeDayDoc,
  RunwayEncryption,
  Stance,
} from '@apps/runway/types';

export const EMPTY_OVERRIDE: DayOverrideSealed = {
  pairings: null,
  holdResolutions: {},
};

export interface DayRef {
  payLineId: string;
  sourceId: string | null;
  expectedOn: number;
}

/**
 * Changes what the person set for one income day. The day's document is created the first time it is
 * overridden (its id is the day key) and updated while it is a draft; the override is read inside
 * the transaction so two devices never write over each other's choice.
 */
export async function saveDayOverride(
  uid: string,
  encryption: RunwayEncryption,
  day: DayRef,
  change: (current: DayOverrideSealed) => DayOverrideSealed,
): Promise<void> {
  const dayKey = toDayKey(day.payLineId, day.expectedOn);
  const ref = doc(db, 'apps', 'runway', 'plans', uid, 'days', dayKey);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists()
      ? (snapshot.data() as Partial<IncomeDayDoc>)
      : null;
    if (existing && existing.status !== 'draft') {
      throw new Error(
        'This day is already settled, so its plan cannot change.',
      );
    }
    const opened = existing?.sealed
      ? await openJson<Partial<DayOverrideSealed>>(existing.sealed, encryption)
      : null;
    const current: DayOverrideSealed = {
      pairings: opened?.pairings ?? null,
      holdResolutions: opened?.holdResolutions ?? {},
    };
    const sealed = await sealJson(change(current), encryption);
    if (existing) {
      transaction.update(ref, { sealed });
      return;
    }
    const created: IncomeDayDoc = {
      id: dayKey,
      payLineId: day.payLineId,
      sourceId: day.sourceId,
      expectedOn: day.expectedOn,
      arrivedOn: null,
      status: 'draft',
      createdAt: Date.now(),
      confirmedAt: null,
      doneLineIds: [],
      sealed,
    };
    transaction.set(ref, created);
  });
}

/** A day another device settled or changed first; the screen may already have moved on, so it is also said in a toast. */
export class DayChangedElsewhere extends Error {}

/** The rules refuse a write built on a day another device has since settled; the person is told that, not the rule's words. */
const asRaceMessage = (error: unknown, message: string) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'permission-denied'
    ? new DayChangedElsewhere(message)
    : error;

const dayRef = (uid: string, dayId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'days', dayId);

const recordRef = (uid: string, dayId: string, recordId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'days', dayId, 'records', recordId);

export interface ConfirmDayInput {
  day: DayRef;
  draft: Draft;
  names: ItemNames;
  stance: Stance;
  /** Names the draft the person looked at. */
  fingerprint: string;
  /** Names the day's changes that draft was computed with. */
  overrideFingerprint: string;
  arrivedOn: DateOnly;
  arrivedCents: Cents;
  note: string | null;
  /** The amounts the person gave lines in place of the draft's, by line id. */
  edits: Record<string, Cents>;
  /** The notes on changed lines, by line id. */
  lineNotes: Record<string, string | null>;
}

/**
 * Confirms an income day in one transaction: the day's status flips and its two records are created
 * together, and a day that is no longer a draft, or whose changes moved since the person looked, is
 * refused with a message. A transaction cannot be queued, so this needs a connection.
 */
export async function confirmDay(
  uid: string,
  encryption: RunwayEncryption,
  input: ConfirmDayInput,
): Promise<void> {
  const { day, draft } = input;
  const dayId = toDayKey(day.payLineId, day.expectedOn);
  if (countUnresolvedHolds(draft) > 0) {
    throw new Error(CONFIRM_WORDS.holds);
  }
  const { proposed, confirmed } = buildRecords({
    draft,
    names: input.names,
    stance: input.stance,
    fingerprint: input.fingerprint,
    arrivedCents: input.arrivedCents,
    note: input.note,
    edits: input.edits,
    lineNotes: input.lineNotes,
  });
  if (
    confirmed.freeToSpendCents < 0 ||
    confirmed.lines.some((line) => line.cents < 0)
  ) {
    throw new Error(CONFIRM_WORDS.linesTakeTooMuch);
  }
  const [sealedProposed, sealedConfirmed, sealedEmpty] = await Promise.all([
    sealJson(proposed, encryption),
    sealJson(confirmed, encryption),
    sealJson(EMPTY_OVERRIDE, encryption),
  ]);

  const ref = dayRef(uid, dayId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists()
      ? (snapshot.data() as Partial<IncomeDayDoc>)
      : null;
    if (existing?.status === 'confirmed') {
      throw new DayChangedElsewhere(
        'This day was already confirmed, maybe on another device. Nothing was changed.',
      );
    }
    if (existing?.status === 'notArrived') {
      throw new Error(
        'This day is marked as not arrived. Put it back before confirming.',
      );
    }
    const stored = existing?.sealed
      ? await openJson<Partial<DayOverrideSealed>>(existing.sealed, encryption)
      : null;
    const current = hashOverride({
      pairings: stored?.pairings ?? null,
      holdResolutions: stored?.holdResolutions ?? {},
    });
    if (current !== input.overrideFingerprint) {
      throw new DayChangedElsewhere(
        "This day's plan changed since you opened it. Close and open it again to see the new draft.",
      );
    }
    const now = Date.now();
    transaction.set(recordRef(uid, dayId, `${dayId}_proposed`), {
      id: `${dayId}_proposed`,
      dayId,
      kind: 'proposed',
      createdAt: now,
      sealed: sealedProposed,
      supersedesId: null,
    } satisfies DayRecordDoc);
    transaction.set(recordRef(uid, dayId, `${dayId}_confirmed`), {
      id: `${dayId}_confirmed`,
      dayId,
      kind: 'confirmed',
      createdAt: now,
      sealed: sealedConfirmed,
      supersedesId: null,
    } satisfies DayRecordDoc);
    if (existing) {
      transaction.update(ref, {
        status: 'confirmed',
        arrivedOn: input.arrivedOn,
        confirmedAt: now,
      });
      return;
    }
    transaction.set(ref, {
      id: dayId,
      payLineId: day.payLineId,
      sourceId: day.sourceId,
      expectedOn: day.expectedOn,
      arrivedOn: input.arrivedOn,
      status: 'confirmed',
      createdAt: now,
      confirmedAt: now,
      doneLineIds: [],
      sealed: sealedEmpty,
    } satisfies IncomeDayDoc);
  }).catch((error: unknown) => {
    throw asRaceMessage(
      error,
      'This day was confirmed or changed on another device. Nothing was changed.',
    );
  });
}

async function moveDay(
  uid: string,
  encryption: RunwayEncryption,
  day: DayRef,
  from: DayStatus,
  to: DayStatus,
  refusal: string,
): Promise<void> {
  const dayId = toDayKey(day.payLineId, day.expectedOn);
  const ref = dayRef(uid, dayId);
  const sealedEmpty =
    from === 'draft' ? await sealJson(EMPTY_OVERRIDE, encryption) : null;
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists()
      ? (snapshot.data() as Partial<IncomeDayDoc>)
      : null;
    const status = existing?.status ?? 'draft';
    if (status !== from) throw new Error(refusal);
    if (existing) {
      transaction.update(ref, { status: to });
      return;
    }
    transaction.set(ref, {
      id: dayId,
      payLineId: day.payLineId,
      sourceId: day.sourceId,
      expectedOn: day.expectedOn,
      arrivedOn: null,
      status: to,
      createdAt: Date.now(),
      confirmedAt: null,
      doneLineIds: [],
      sealed: sealedEmpty,
    } satisfies IncomeDayDoc);
  }).catch((error: unknown) => {
    throw asRaceMessage(
      error,
      'This day was settled on another device. Nothing was changed.',
    );
  });
}

/** Takes a day off the plan. Its draft disappears and no records are written; undoing it puts the draft back. */
export function markNotArrived(
  uid: string,
  encryption: RunwayEncryption,
  day: DayRef,
): Promise<void> {
  return moveDay(
    uid,
    encryption,
    day,
    'draft',
    'notArrived',
    'This day was already settled, maybe on another device. Nothing was changed.',
  );
}

export function undoNotArrived(
  uid: string,
  encryption: RunwayEncryption,
  day: DayRef,
): Promise<void> {
  return moveDay(
    uid,
    encryption,
    day,
    'notArrived',
    'draft',
    'This day is no longer marked as not arrived.',
  );
}

export interface CorrectDayInput {
  dayId: string;
  /** The split the person looked at; the correction replaces exactly this record. */
  base: EffectiveSplit;
  arrivedCents: Cents;
  /** The amounts the person gave lines in place of the current ones, by line id. */
  edits: Record<string, Cents>;
  note: string | null;
}

/**
 * Corrects a confirmed day by writing a new record that replaces the split the person looked at. The
 * original is never touched. The record's id comes from the one it replaces, so a device that looked
 * at an older split cannot write a second correction beside the first. Lines whose amount changed
 * are unticked on the checklist in the same write.
 */
export async function correctDay(
  uid: string,
  encryption: RunwayEncryption,
  input: CorrectDayInput,
): Promise<void> {
  const { dayId, base } = input;
  const sealedPayload = buildCorrection({
    base,
    arrivedCents: input.arrivedCents,
    edits: input.edits,
    note: input.note,
  });
  if (
    sealedPayload.freeToSpendCents < 0 ||
    sealedPayload.lines.some((line) => line.cents < 0)
  ) {
    throw new Error(CONFIRM_WORDS.linesTakeTooMuch);
  }
  if (
    sealedPayload.changes.length === 0 &&
    sealedPayload.arrivedCents === base.arrivedCents
  ) {
    throw new Error('Nothing was changed, so there is nothing to correct.');
  }
  const sealed = await sealJson(sealedPayload, encryption);
  const id = getCorrectionId(base.recordId);
  const ref = dayRef(uid, dayId);
  await runTransaction(db, async (transaction) => {
    const [daySnapshot, replaced, existing] = await Promise.all([
      transaction.get(ref),
      transaction.get(recordRef(uid, dayId, base.recordId)),
      transaction.get(recordRef(uid, dayId, id)),
    ]);
    const day = daySnapshot.exists()
      ? (daySnapshot.data() as Partial<IncomeDayDoc>)
      : null;
    if (day?.status !== 'confirmed' || !replaced.exists()) {
      throw new Error('Only a confirmed day can be corrected.');
    }
    if (existing.exists()) {
      throw new DayChangedElsewhere(CORRECT_WORDS.elsewhere);
    }
    transaction.set(recordRef(uid, dayId, id), {
      id,
      dayId,
      kind: 'correction',
      createdAt: Date.now(),
      sealed,
      supersedesId: base.recordId,
    } satisfies DayRecordDoc);
    const ticks = day.doneLineIds ?? [];
    const kept = keepTicks(ticks, sealedPayload.changes);
    if (kept.length !== ticks.length) {
      transaction.update(ref, { doneLineIds: kept });
    }
  }).catch((error: unknown) => {
    throw asRaceMessage(error, CORRECT_WORDS.elsewhere);
  });
}
