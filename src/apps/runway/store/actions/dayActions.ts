import { doc, runTransaction, setDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';

import { formatDateUTC } from '@/utils/formatUtils';
import {
  CONFIRM_WORDS,
  CORRECT_WORDS,
  PAY_SHARE_WORDS,
} from '@apps/runway/constants';
import type { BillPin } from '@apps/runway/engine/billShare';
import {
  buildRecords,
  countUnresolvedHolds,
  type ItemNames,
} from '@apps/runway/engine/confirm';
import {
  buildCorrection,
  getCorrectionCover,
  getCorrectionId,
  keepTicks,
  type EffectiveSplit,
} from '@apps/runway/engine/correct';
import { toDayKey } from '@apps/runway/engine/dates';
import { isWithinCover } from '@apps/runway/engine/differences';
import type { Draft } from '@apps/runway/engine/draft';
import { hashOverride } from '@apps/runway/engine/fingerprint';
import { hasOwnChoices } from '@apps/runway/engine/moved';
import { openJson, sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import type {
  ChangeDoc,
  ChangeSealed,
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
  payloads: {},
  billCents: {},
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
  log?: { itemId: string; summary: string; note: string | null },
): Promise<void> {
  const dayKey = toDayKey(day.payLineId, day.expectedOn);
  const changeSealed = log
    ? await sealJson<ChangeSealed>(
        { summary: log.summary, note: log.note },
        encryption,
      )
    : null;
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
      payloads: opened?.payloads ?? {},
      billCents: opened?.billCents ?? {},
    };
    const sealed = await sealJson(change(current), encryption);
    if (log && changeSealed) {
      const changeId = generateUuid();
      const entry: ChangeDoc = {
        id: changeId,
        kind: 'planChange',
        createdAt: Date.now(),
        effectiveFrom: day.expectedOn,
        itemIds: [log.itemId],
        sealed: changeSealed,
      };
      transaction.set(
        doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
        entry,
      );
    }
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

/** Sets what one income day puts toward a bill (`null` takes the day's own figure back), keeping the day's other choices. */
export function saveBillShare(
  uid: string,
  encryption: RunwayEncryption,
  day: DayRef,
  billId: string,
  cents: Cents | null,
  log?: { itemId: string; summary: string; note: string | null },
  /** What the day's figure must still be for this write to take (an Undo only takes back its own change). */
  expect?: { was: Cents | undefined },
): Promise<void> {
  return saveDayOverride(
    uid,
    encryption,
    day,
    (current) => {
      if (expect && current.billCents[billId] !== expect.was) {
        throw new BillShareChanged();
      }
      return {
        ...current,
        billCents:
          cents === null
            ? Object.fromEntries(
                Object.entries(current.billCents).filter(
                  ([id]) => id !== billId,
                ),
              )
            : { ...current.billCents, [billId]: cents },
      };
    },
    log,
  );
}

/** What a pay puts toward a bill changed since the action being taken back made its change. */
export class BillShareChanged extends Error {
  constructor() {
    super('This pay was changed again since, so nothing was taken back.');
  }
}

const describePinDays = (pins: readonly BillPin[]) =>
  pins.map((pin) => formatDateUTC(pin.expectedOn)).join(', ');

const toDayRef = (pin: BillPin): DayRef => ({
  payLineId: pin.payLineId,
  sourceId: pin.sourceId,
  expectedOn: pin.expectedOn,
});

/** A clear that stopped part way: the days it did clear, so an Undo can put them back. */
export class PinsPartlyCleared extends Error {
  constructor(
    readonly cleared: BillPin[],
    cause: unknown,
  ) {
    super(
      cause instanceof Error ? cause.message : 'Some days were not cleared.',
    );
  }
}

/** One history line for a bill, written after the days it names were written. */
const writeHistoryLine = async (
  uid: string,
  encryption: RunwayEncryption,
  billId: string,
  summary: string,
  effectiveFrom: number,
) => {
  const changeId = generateUuid();
  const entry: ChangeDoc = {
    id: changeId,
    kind: 'planChange',
    createdAt: Date.now(),
    effectiveFrom,
    itemIds: [billId],
    sealed: await sealJson<ChangeSealed>({ summary, note: null }, encryption),
  };
  await setDoc(
    doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId),
    entry,
  );
};

/** Runs a write over each pin in turn, going on past one that fails; returns the days it did and the first error. */
const forEachPin = async (
  pins: readonly BillPin[],
  write: (pin: BillPin) => Promise<void>,
) => {
  const result = await pins.reduce<
    Promise<{ done: BillPin[]; failed: BillPin[]; error: unknown }>
  >(
    async (previous, pin) => {
      const acc = await previous;
      try {
        await write(pin);
        return { ...acc, done: [...acc.done, pin] };
      } catch (error) {
        return {
          ...acc,
          failed: [...acc.failed, pin],
          error: acc.error ?? error,
        };
      }
    },
    Promise.resolve({ done: [], failed: [], error: null }),
  );
  return result;
};

/** Takes every per-pay figure of one bill off the given days. A day that fails is skipped; one history line names only the days it did clear, and a stop part way throws what was cleared so an Undo can put it back. */
export async function clearBillPins(
  uid: string,
  encryption: RunwayEncryption,
  billId: string,
  billName: string,
  pins: readonly BillPin[],
): Promise<BillPin[]> {
  const { done, failed, error } = await forEachPin(pins, (pin) =>
    saveBillShare(uid, encryption, toDayRef(pin), billId, null),
  );
  if (done.length > 0) {
    await writeHistoryLine(
      uid,
      encryption,
      billId,
      PAY_SHARE_WORDS.pinsCleared(billName, describePinDays(done)),
      done[0].expectedOn,
    ).catch((historyError: unknown) =>
      console.error('History line not written', historyError),
    );
  }
  if (failed.length > 0) throw new PinsPartlyCleared(done, error);
  return done;
}

/** Puts back per-pay figures a clear took off. A day changed again since (or one that fails) is left as it is and skipped; one history line names only the days it did put back. */
export async function restoreBillPins(
  uid: string,
  encryption: RunwayEncryption,
  billId: string,
  billName: string,
  pins: readonly BillPin[],
): Promise<{ restored: BillPin[]; skipped: BillPin[] }> {
  const { done, failed } = await forEachPin(pins, (pin) =>
    saveBillShare(
      uid,
      encryption,
      toDayRef(pin),
      billId,
      pin.cents,
      undefined,
      {
        was: undefined,
      },
    ),
  );
  if (done.length > 0) {
    await writeHistoryLine(
      uid,
      encryption,
      billId,
      PAY_SHARE_WORDS.pinsBack(billName, describePinDays(done)),
      done[0].expectedOn,
    ).catch((historyError: unknown) =>
      console.error('History line not written', historyError),
    );
  }
  return { restored: done, skipped: failed };
}

/** A day another device settled or changed first; the screen may already have moved on, so it is also said in a toast. */
export class DayChangedElsewhere extends Error {}

/** A record another device already created is refused on its id; the person is told the day changed, not the rule's words. */
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
  /** What the person chose to cover from Free to Spend: the day may leave this much less than nothing. */
  coverCents: Cents;
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
    !isWithinCover(confirmed.freeToSpendCents, input.coverCents) ||
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
    const [snapshot, plan] = await Promise.all([
      transaction.get(ref),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
    ]);
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
      payloads: stored?.payloads,
      billCents: stored?.billCents,
    });
    if (current !== input.overrideFingerprint) {
      throw new DayChangedElsewhere(
        "This day's plan changed since you opened it. Close and open it again to see the new draft.",
      );
    }
    const now = Date.now();
    markLedgerWrite(transaction, uid, plan.data(), [day.expectedOn]);
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
  /** What the person chose to cover from Free to Spend beyond the cover the day already had. */
  addedCoverCents: Cents;
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
    !isWithinCover(
      sealedPayload.freeToSpendCents,
      getCorrectionCover(base, input.addedCoverCents),
    ) ||
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
    const [daySnapshot, replaced, existing, plan] = await Promise.all([
      transaction.get(ref),
      transaction.get(recordRef(uid, dayId, base.recordId)),
      transaction.get(recordRef(uid, dayId, id)),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
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
    markLedgerWrite(transaction, uid, plan.data(), [day.expectedOn ?? null]);
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

const readChoices = async (
  sealed: IncomeDayDoc['sealed'] | undefined,
  encryption: RunwayEncryption,
): Promise<DayOverrideSealed> => {
  const opened = sealed
    ? await openJson<Partial<DayOverrideSealed>>(sealed, encryption)
    : null;
  return {
    pairings: opened?.pairings ?? null,
    holdResolutions: opened?.holdResolutions ?? {},
    payloads: opened?.payloads ?? {},
    billCents: opened?.billCents ?? {},
  };
};

/**
 * Moves the person's own choices for each day to the date its payday moved to, one transaction per
 * day: the old day is re-read and must still be a draft, and the new one must have no choices of its
 * own, so nothing another device chose is written over. Every day is tried; returns how many moved and
 * the old dates of the days whose write failed.
 */
export async function carryDayOverrides(
  uid: string,
  encryption: RunwayEncryption,
  moves: readonly { fromId: string; fromOn: DateOnly; to: DayRef }[],
): Promise<{ moved: number; failedOn: DateOnly[] }> {
  const sealedEmpty = await sealJson(EMPTY_OVERRIDE, encryption);
  const results = await Promise.allSettled(
    moves.map(({ fromId, to }) => {
      const toId = toDayKey(to.payLineId, to.expectedOn);
      return runTransaction(db, async (transaction) => {
        const [fromSnapshot, toSnapshot] = await Promise.all([
          transaction.get(dayRef(uid, fromId)),
          transaction.get(dayRef(uid, toId)),
        ]);
        const from = fromSnapshot.exists()
          ? (fromSnapshot.data() as Partial<IncomeDayDoc>)
          : null;
        if (from?.status !== 'draft' || !from.sealed) return false;
        const target = toSnapshot.exists()
          ? (toSnapshot.data() as Partial<IncomeDayDoc>)
          : null;
        const theirs = await readChoices(target?.sealed, encryption);
        const isTargetFree =
          target === null ||
          (target.status === 'draft' && !hasOwnChoices(theirs));
        if (!isTargetFree) return false;
        const sealed = await sealJson(
          await readChoices(from.sealed, encryption),
          encryption,
        );
        transaction.update(dayRef(uid, fromId), { sealed: sealedEmpty });
        if (target) {
          transaction.update(dayRef(uid, toId), { sealed });
          return true;
        }
        transaction.set(dayRef(uid, toId), {
          id: toId,
          payLineId: to.payLineId,
          sourceId: to.sourceId,
          expectedOn: to.expectedOn,
          arrivedOn: null,
          status: 'draft',
          createdAt: Date.now(),
          confirmedAt: null,
          doneLineIds: [],
          sealed,
        } satisfies IncomeDayDoc);
        return true;
      });
    }),
  );
  const failed = results.flatMap((outcome, index) =>
    outcome.status === 'rejected'
      ? [{ on: moves[index].fromOn, error: outcome.reason as unknown }]
      : [],
  );
  failed.forEach(({ error }) =>
    console.error('Moving day choices failed', error),
  );
  const result = {
    moved: results.filter(
      (outcome) => outcome.status === 'fulfilled' && outcome.value,
    ).length,
    failedOn: failed.map(({ on }) => on),
  };
  return result;
}
