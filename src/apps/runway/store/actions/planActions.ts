import { doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { DEFAULT_CURRENCY_CODE } from '@apps/runway/constants';
import { toDayStamp } from '@apps/runway/engine/dates';
import {
  startTrackingPeriod,
  stopTrackingPeriod,
} from '@apps/runway/engine/level';
import { sealJson } from '@apps/runway/security';
import { getLedgerMark } from '@apps/runway/store/actions/closingActions';
import {
  getStartMoveId,
  type StartHoldingInput,
} from '@apps/runway/store/actions/moveActions';
import type {
  ChangeDoc,
  ChangeSealed,
  DateOnly,
  MoveDoc,
  PlanDoc,
  RunwayEncryption,
  Stance,
  StartSealed,
  TrackingChangeSealed,
} from '@apps/runway/types';

/** Creates the plan on first open and leaves an existing one alone, so two tabs opening together make one. */
export async function ensurePlan(uid: string, encryption: RunwayEncryption) {
  const planRef = doc(db, 'apps', 'runway', 'plans', uid);
  const sealed = await sealJson(
    { currencyCode: DEFAULT_CURRENCY_CODE },
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
      ? `Started tracking from ${formatDateUTC(date)}.`
      : `Stopped tracking after ${formatDateUTC(date)}.`;
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
