import {
  doc,
  getDocFromCache,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  DEFAULT_CURRENCY_CODE,
  HOLDS_ASK_LATER_DAYS,
  HOME_PIN_WORDS,
  HOME_TILE_COUNT,
} from '@apps/runway/constants';
import {
  moveInList,
  readHomePins,
  withHiddenPins,
} from '@apps/runway/utils/homePins';
import { toDayStamp } from '@apps/runway/engine/dates';
import {
  getLevel,
  linkTrackingPeriod,
  startTrackingPeriod,
  stopTrackingPeriod,
  unlinkTrackingPeriod,
} from '@apps/runway/engine/level';
import { openJson, sealJson } from '@apps/runway/security';
import { getLedgerMark } from '@apps/runway/store/actions/closingActions';
import {
  getStartMoveId,
  type StartHoldingInput,
} from '@apps/runway/store/actions/moveActions';
import type {
  ChangeDoc,
  ChangeSealed,
  DateOnly,
  HoldsPromptChoice,
  MoveDoc,
  PlanDoc,
  PlanSealedFields,
  RunwayEncryption,
  Stance,
  StartSealed,
  TrackingChangeSealed,
} from '@apps/runway/types';

/** Whether the plan is in this device's saved copy, so opening it needs no transaction. */
export async function isPlanCached(uid: string) {
  const snapshot = await getDocFromCache(
    doc(db, 'apps', 'runway', 'plans', uid),
  ).catch(() => null);
  return snapshot?.exists() ?? false;
}

/** Creates the plan on first open and leaves an existing one alone, so two tabs opening together make one. */
export async function ensurePlan(uid: string, encryption: RunwayEncryption) {
  const planRef = doc(db, 'apps', 'runway', 'plans', uid);
  const sealed = await sealJson(
    {
      currencyCode: DEFAULT_CURRENCY_CODE,
      notifyHour: null,
      notifyTimeZone: null,
      holdsPrompt: null,
      bankBackedSeenAt: null,
      horizonNudgeDismissed: null,
      homePins: null,
    } satisfies PlanSealedFields,
    encryption,
  );

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(planRef);
    if (snapshot.exists()) return;

    const now = Date.now();
    const plan: PlanDoc = {
      uid,
      createdAt: now,
      updatedAt: now,
      stance: 'conservative',
      startDate: null,
      trackingPeriods: [],
      dirtyFrom: null,
      notify: { needsHome: false },
      keyId: encryption.keyId,
      sealed,
    };
    transaction.set(planRef, plan);
  });
}

/** Writes only the stance and when it changed, so a concurrent edit to another plan field is never overwritten. */
export async function setStance(uid: string, stance: Stance) {
  await updateDoc(doc(db, 'apps', 'runway', 'plans', uid), {
    stance,
    updatedAt: Date.now(),
  });
}

export interface NotifyPatch {
  needsHome?: boolean;
  hour?: number;
  timeZone?: string | null;
}

/** Saves the push choices: the switch in `notify` and the hour and zone re-sealed with the plan's other sealed fields, in one write that reads the plan fresh so a second device's change is kept. */
export async function setNotify(
  uid: string,
  encryption: RunwayEncryption,
  patch: NotifyPatch,
) {
  const ref = doc(db, 'apps', 'runway', 'plans', uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const plan = snapshot.data() as PlanDoc;
    const current: Partial<PlanSealedFields> = plan.sealed
      ? await openJson<PlanSealedFields>(plan.sealed, encryption)
      : {};
    const sealed = await sealJson(
      {
        currencyCode: current.currencyCode ?? DEFAULT_CURRENCY_CODE,
        notifyHour:
          patch.hour === undefined ? (current.notifyHour ?? null) : patch.hour,
        notifyTimeZone:
          patch.timeZone === undefined
            ? (current.notifyTimeZone ?? null)
            : patch.timeZone,
        holdsPrompt: current.holdsPrompt ?? null,
        bankBackedSeenAt: current.bankBackedSeenAt ?? null,
        horizonNudgeDismissed: current.horizonNudgeDismissed ?? null,
        homePins: current.homePins ?? null,
      } satisfies PlanSealedFields,
      encryption,
    );
    transaction.update(ref, {
      sealed,
      notify: { needsHome: patch.needsHome ?? plan.notify?.needsHome ?? false },
      updatedAt: Date.now(),
    });
  });
}

type SealedPatch = Partial<
  Pick<
    PlanSealedFields,
    'holdsPrompt' | 'bankBackedSeenAt' | 'horizonNudgeDismissed' | 'homePins'
  >
>;

/** Re-seals the plan's sealed fields with one change, reading the plan fresh so a second device's change to another field is kept. */
async function patchSealedFields(
  uid: string,
  encryption: RunwayEncryption,
  patch: SealedPatch | ((current: Partial<PlanSealedFields>) => SealedPatch),
) {
  const ref = doc(db, 'apps', 'runway', 'plans', uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const plan = snapshot.data() as PlanDoc;
    const current: Partial<PlanSealedFields> = plan.sealed
      ? await openJson<PlanSealedFields>(plan.sealed, encryption)
      : {};
    const sealed = await sealJson(
      {
        currencyCode: current.currencyCode ?? DEFAULT_CURRENCY_CODE,
        notifyHour: current.notifyHour ?? null,
        notifyTimeZone: current.notifyTimeZone ?? null,
        holdsPrompt: current.holdsPrompt ?? null,
        bankBackedSeenAt: current.bankBackedSeenAt ?? null,
        horizonNudgeDismissed: current.horizonNudgeDismissed ?? null,
        homePins: current.homePins ?? null,
        ...(typeof patch === 'function' ? patch(current) : patch),
      } satisfies PlanSealedFields,
      encryption,
    );
    transaction.update(ref, { sealed, updatedAt: Date.now() });
  });
}

/** Saves the answer to the "where are they kept" prompt. */
export async function setHoldsPrompt(
  uid: string,
  encryption: RunwayEncryption,
  answer: 'later' | 'never',
) {
  await patchSealedFields(uid, encryption, {
    holdsPrompt: {
      askAfter:
        answer === 'later'
          ? Date.now() + HOLDS_ASK_LATER_DAYS * 24 * 60 * 60 * 1000
          : null,
      isOff: answer === 'never',
    } satisfies HoldsPromptChoice,
  });
}

/** Records that the person read why Free to Spend now comes from their account balances. */
export async function setBankBackedSeen(
  uid: string,
  encryption: RunwayEncryption,
) {
  await patchSealedFields(uid, encryption, { bankBackedSeenAt: Date.now() });
}

/** Stops asking about Horizon for one goal at its current target date; a changed date asks again. Reads the plan fresh so another goal's answer is kept. */
export async function dismissHorizonNudge(
  uid: string,
  encryption: RunwayEncryption,
  goalId: string,
  targetDate: DateOnly,
) {
  const ref = doc(db, 'apps', 'runway', 'plans', uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const plan = snapshot.data() as PlanDoc;
    const current: Partial<PlanSealedFields> = plan.sealed
      ? await openJson<PlanSealedFields>(plan.sealed, encryption)
      : {};
    const sealed = await sealJson(
      {
        currencyCode: current.currencyCode ?? DEFAULT_CURRENCY_CODE,
        notifyHour: current.notifyHour ?? null,
        notifyTimeZone: current.notifyTimeZone ?? null,
        holdsPrompt: current.holdsPrompt ?? null,
        bankBackedSeenAt: current.bankBackedSeenAt ?? null,
        horizonNudgeDismissed: {
          ...(current.horizonNudgeDismissed ?? {}),
          [goalId]: targetDate,
        },
        homePins: current.homePins ?? null,
      } satisfies PlanSealedFields,
      encryption,
    );
    transaction.update(ref, { sealed, updatedAt: Date.now() });
  });
}

/** Pins an envelope to Home's next free tile, or unpins it; reads the plan fresh so another device's pins are kept, and refuses a pin past the cap. */
export async function setHomePin(
  uid: string,
  encryption: RunwayEncryption,
  itemId: string,
  isPinned: boolean,
  liveIds: string[],
) {
  await patchSealedFields(uid, encryption, (current) => {
    const saved = current.homePins ?? null;
    const pins = readHomePins(saved, liveIds);
    const save = (next: string[]) => ({
      homePins: withHiddenPins(next, saved, liveIds),
    });
    if (!isPinned) return save(pins.filter((id) => id !== itemId));
    if (pins.includes(itemId)) return save(pins);
    if (pins.length >= HOME_TILE_COUNT) throw new Error(HOME_PIN_WORDS.full);
    return save([...pins, itemId]);
  });
}

/** Moves a pinned envelope one place earlier or later on Home. */
export async function moveHomePin(
  uid: string,
  encryption: RunwayEncryption,
  itemId: string,
  step: -1 | 1,
  liveIds: string[],
) {
  await patchSealedFields(uid, encryption, (current) => {
    const saved = current.homePins ?? null;
    const moved = moveInList(readHomePins(saved, liveIds), itemId, step);
    return { homePins: withHiddenPins(moved, saved, liveIds) };
  });
}

const planPath = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const subPath = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

const STALE_MESSAGE =
  'This plan changed on another device. Open Settings again to see where it stands.';

/** One `trackingChange` move and one `levelMove` change, sealed, for a transition on `date`. */
async function sealTrackingRecords(
  encryption: RunwayEncryption,
  direction: TrackingChangeSealed['direction'],
  date: DateOnly,
) {
  const summary =
    direction === 'up'
      ? `Started tracking from ${formatDateOrdinalUTC(date)}.`
      : `Stopped tracking after ${formatDateOrdinalUTC(date)}.`;
  const [moveSealed, changeSealed] = await Promise.all([
    sealJson({ direction } satisfies TrackingChangeSealed, encryption),
    sealJson({ summary } satisfies ChangeSealed, encryption),
  ]);
  const result = { moveSealed, changeSealed };
  return result;
}

const getTrackingMoveId = (date: DateOnly, createdAt: number) =>
  `tracking_${toDayStamp(date)}_${createdAt}`;

/**
 * Turns tracking on from `startDate`: a new period, the starting amounts as of that day, a `trackingChange`
 * move and a `levelMove` change, in one transaction that reads the plan fresh. A device whose plan still
 * shows Plan after another one moved up is refused with a readable message.
 */
export async function moveToTrack(
  uid: string,
  encryption: RunwayEncryption,
  startDate: DateOnly,
  holdings: readonly StartHoldingInput[],
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const { moveSealed, changeSealed } = await sealTrackingRecords(
    encryption,
    'up',
    startDate,
  );
  const sealedHoldings = await Promise.all(
    holdings.map((entry) =>
      sealJson(
        {
          amountCents: entry.amountCents,
          holding: entry.holding,
        } satisfies StartSealed,
        encryption,
      ),
    ),
  );
  const ref = planPath(uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const plan = snapshot.data() as PlanDoc;
    const periods = plan.trackingPeriods ?? [];
    const next = startTrackingPeriod(periods, startDate);
    if ('error' in next) throw new Error(next.error);

    const before = plan.startDate ?? null;
    const mark = getLedgerMark(
      plan,
      before === startDate ? [] : [before, startDate],
    );
    transaction.update(ref, {
      trackingPeriods: next.periods,
      startDate,
      updatedAt: now,
      ...mark,
    });
    const moveId = getTrackingMoveId(startDate, now);
    transaction.set(subPath(uid, 'moves', moveId), {
      id: moveId,
      kind: 'trackingChange',
      date: startDate,
      refId: null,
      reversesMoveId: null,
      createdAt: now,
      sealed: moveSealed,
    } satisfies MoveDoc);
    holdings.forEach((entry, index) => {
      const id = getStartMoveId(entry.refId, now);
      transaction.set(subPath(uid, 'moves', id), {
        id,
        kind: 'start',
        date: startDate,
        refId: entry.refId,
        reversesMoveId: null,
        createdAt: now,
        sealed: sealedHoldings[index],
      } satisfies MoveDoc);
    });
    transaction.set(subPath(uid, 'changes', changeId), {
      id: changeId,
      kind: 'levelMove',
      createdAt: now,
      effectiveFrom: startDate,
      itemIds: [],
      sealed: changeSealed,
    } satisfies ChangeDoc);
  });
}

/**
 * Turns tracking off after `stopDate`: the open period gets its end, with a `trackingChange` move and a
 * `levelMove` change. Nothing is deleted, so every period, purchase and starting amount stays in history.
 */
export async function moveToPlan(
  uid: string,
  encryption: RunwayEncryption,
  stopDate: DateOnly,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const { moveSealed, changeSealed } = await sealTrackingRecords(
    encryption,
    'down',
    stopDate,
  );
  const ref = planPath(uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const periods = (snapshot.data() as PlanDoc).trackingPeriods ?? [];
    const next = stopTrackingPeriod(periods, stopDate);
    if ('error' in next) throw new Error(next.error);

    transaction.update(ref, { trackingPeriods: next.periods, updatedAt: now });
    const moveId = getTrackingMoveId(stopDate, now);
    transaction.set(subPath(uid, 'moves', moveId), {
      id: moveId,
      kind: 'trackingChange',
      date: stopDate,
      refId: null,
      reversesMoveId: null,
      createdAt: now,
      sealed: moveSealed,
    } satisfies MoveDoc);
    transaction.set(subPath(uid, 'changes', changeId), {
      id: changeId,
      kind: 'levelMove',
      createdAt: now,
      effectiveFrom: stopDate,
      itemIds: [],
      sealed: changeSealed,
    } satisfies ChangeDoc);
  });
}

/** Moves Track up to Link from `linkDate` in one transaction, writing the period's link day and a `levelMove` change; a plan already at Link is left alone. */
export async function moveToLink(
  uid: string,
  encryption: RunwayEncryption,
  linkDate: DateOnly,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const changeSealed = await sealJson(
    {
      summary: `Linked a bank from ${formatDateOrdinalUTC(linkDate)}.`,
    } satisfies ChangeSealed,
    encryption,
  );
  const ref = planPath(uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const periods = (snapshot.data() as PlanDoc).trackingPeriods ?? [];
    if (getLevel(periods) === 'link') return;
    const next = linkTrackingPeriod(periods, linkDate);
    if ('error' in next) throw new Error(next.error);

    transaction.update(ref, { trackingPeriods: next.periods, updatedAt: now });
    transaction.set(subPath(uid, 'changes', changeId), {
      id: changeId,
      kind: 'levelMove',
      createdAt: now,
      effectiveFrom: null,
      itemIds: [],
      sealed: changeSealed,
    } satisfies ChangeDoc);
  });
}

/** Records an unlink in the change log; when it was the last bank and the plan is at Link, also moves it down to Track in the same transaction (a `levelMove`). */
export async function recordUnlink(
  uid: string,
  encryption: RunwayEncryption,
  institutionNames: string,
  isLastBank: boolean,
): Promise<void> {
  const now = Date.now();
  const changeId = generateUuid();
  const changeSealed = await sealJson(
    {
      summary: `Unlinked ${institutionNames}; new purchases stop. What came in stays.`,
    } satisfies ChangeSealed,
    encryption,
  );
  const ref = planPath(uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error(STALE_MESSAGE);
    const periods = (snapshot.data() as PlanDoc).trackingPeriods ?? [];
    const isMovingDown = isLastBank && getLevel(periods) === 'link';
    if (isMovingDown) {
      const next = unlinkTrackingPeriod(periods);
      if ('error' in next) throw new Error(next.error);
      transaction.update(ref, {
        trackingPeriods: next.periods,
        updatedAt: now,
      });
    }
    transaction.set(subPath(uid, 'changes', changeId), {
      id: changeId,
      kind: isMovingDown ? 'levelMove' : 'accountChange',
      createdAt: now,
      effectiveFrom: null,
      itemIds: [],
      sealed: changeSealed,
    } satisfies ChangeDoc);
  });
}
