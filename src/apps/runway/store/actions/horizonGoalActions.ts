import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { formatCents } from '@/utils/moneyUtils';

import { HORIZON_PLAN_WORDS } from '@apps/runway/constants';
import { getNextVersionId } from '@apps/runway/engine/horizon';
import { getGoalCost, getGoalCostId } from '@apps/runway/engine/horizonGoal';
import { sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import {
  setHorizonStateWith,
  type HorizonStateWritten,
} from '@apps/runway/store/actions/horizonActions';
import {
  assertPlanStarted,
  assertSourceLive,
  getChangeDoc,
  getUndoTransferMoveId,
  sealMoveLeftover,
  writeSealedMove,
  type UndoTransferInput,
} from '@apps/runway/store/actions/transferActions';
import type {
  ChangeDoc,
  ChangeSealed,
  Cents,
  DateOnly,
  GoalSealed,
  HorizonSealed,
  MoveDoc,
  PlanDoc,
  PlanItemDoc,
  RunwayEncryption,
  TransferSealed,
} from '@apps/runway/types';

const planDoc = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

export interface LinkGoalInput {
  eventId: string;
  /** The id of the event's version in force; the new version's id comes from it. */
  baseVersionId: string;
  /** The event as the device reads it just before the write. */
  horizon: HorizonSealed;
  goalId: string;
  goal: Pick<GoalSealed, 'name' | 'targetCents'>;
  today: DateOnly;
}

/** Links an open event to a goal: a new version carrying `goalId`, the goal's target as the event's first cost when the event has not had it, and one change entry listed on both. Resolves null when another device changed the event first. */
export async function linkGoalToHorizon(
  uid: string,
  encryption: RunwayEncryption,
  input: LinkGoalInput,
): Promise<HorizonStateWritten | null> {
  const { horizon, goalId, goal } = input;
  const hasCost = horizon.costs.some(({ id }) => id === getGoalCostId(goalId));
  const after: HorizonSealed = {
    ...horizon,
    goalId,
    costs: hasCost
      ? horizon.costs
      : [...horizon.costs, getGoalCost(goal, goalId, horizon.happensOn)],
  };
  const versionId = getNextVersionId(input.baseVersionId);
  const isWritten = await setHorizonStateWith(uid, encryption, {
    versionId,
    itemId: input.eventId,
    horizon: after,
    summary: HORIZON_PLAN_WORDS.linkSummary(
      goal.name,
      horizon.name,
      hasCost ? null : formatCents(goal.targetCents),
    ),
    note: null,
    on: input.today,
    move: null,
    alsoItemIds: [goalId],
  });
  return isWritten
    ? {
        itemId: input.eventId,
        versionId,
        before: horizon,
        after,
        move: null,
      }
    : null;
}

export interface UnlinkGoalInput {
  eventId: string;
  baseVersionId: string;
  horizon: HorizonSealed;
  goalName: string;
  today: DateOnly;
}

/** Unlinks an event from its goal: a new version with `goalId` null and one change entry listed on both. The cost the link added stays on the event. */
export async function unlinkGoalFromHorizon(
  uid: string,
  encryption: RunwayEncryption,
  input: UnlinkGoalInput,
): Promise<HorizonStateWritten | null> {
  const { horizon } = input;
  if (horizon.goalId === null) return null;
  const after: HorizonSealed = { ...horizon, goalId: null };
  const versionId = getNextVersionId(input.baseVersionId);
  const isWritten = await setHorizonStateWith(uid, encryption, {
    versionId,
    itemId: input.eventId,
    horizon: after,
    summary: HORIZON_PLAN_WORDS.unlinkSummary(input.goalName, horizon.name),
    note: null,
    on: input.today,
    move: null,
    alsoItemIds: [horizon.goalId],
  });
  return isWritten
    ? {
        itemId: input.eventId,
        versionId,
        before: horizon,
        after,
        move: null,
      }
    : null;
}

export interface EnvelopeIntoHorizonInput {
  moveId: string;
  envelopeId: string;
  envelopeName: string;
  eventId: string;
  eventName: string;
  cents: Cents;
  /** What the envelope holds as this device reads it. */
  leftCents: Cents;
}

export interface EnvelopeIntoHorizonWritten {
  move: UndoTransferInput;
  /** The day the envelope was closed, which the Undo checks is still the one on its header. */
  archivedAt: DateOnly;
}

/** Moves an envelope's held money into an open event and closes the envelope, in one transaction: the dated transfer, its history line, the write-once close and the envelope's own line saying where the money went. */
export async function putEnvelopeIntoHorizon(
  uid: string,
  encryption: RunwayEncryption,
  input: EnvelopeIntoHorizonInput,
): Promise<EnvelopeIntoHorizonWritten> {
  const money = formatCents(input.cents);
  const summary = HORIZON_PLAN_WORDS.envelopeMoved(
    input.envelopeName,
    money,
    input.eventName,
  );
  const undoText = HORIZON_PLAN_WORDS.envelopeMoveUndo(
    input.envelopeName,
    money,
    input.eventName,
  );
  const sealedMove = await sealMoveLeftover(encryption, {
    moveId: input.moveId,
    fromId: input.envelopeId,
    toId: input.eventId,
    cents: input.cents,
    isOutside: false,
    leftCents: input.leftCents,
    note: null,
    summary: `${summary}.`,
    undoText,
  });
  const archiveId = `${input.moveId}_closed`;
  const archiveSealed = await sealJson(
    {
      summary: HORIZON_PLAN_WORDS.envelopeArchiveSummary(
        money,
        input.eventName,
      ),
    } satisfies ChangeSealed,
    encryption,
  );
  const archivedAt = sealedMove.date;
  await runTransaction(db, async (transaction) => {
    const [plan, envelope, event, existing] = await Promise.all([
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      transaction.get(planDoc(uid, 'items', input.envelopeId)),
      transaction.get(planDoc(uid, 'items', input.eventId)),
      transaction.get(planDoc(uid, 'moves', input.moveId)),
    ]);
    if (existing.exists()) return;
    assertPlanStarted(plan.data() as Partial<PlanDoc> | undefined, archivedAt);
    assertSourceLive(envelope.data() as Partial<PlanItemDoc> | undefined);
    assertSourceLive(event.data() as Partial<PlanItemDoc> | undefined);
    writeSealedMove(
      transaction,
      uid,
      input.moveId,
      plan.data() as Partial<PlanDoc> | undefined,
      sealedMove,
      input.envelopeId,
    );
    transaction.update(planDoc(uid, 'items', input.envelopeId), { archivedAt });
    transaction.set(planDoc(uid, 'changes', archiveId), {
      id: archiveId,
      kind: 'planChange',
      createdAt: Date.now(),
      effectiveFrom: archivedAt,
      itemIds: [input.envelopeId, input.eventId],
      sealed: archiveSealed,
    } satisfies ChangeDoc);
  });
  return {
    archivedAt,
    move: {
      moveId: input.moveId,
      bill: null,
      cost: null,
      date: sealedMove.date,
      fromId: input.envelopeId,
      toId: input.eventId,
      cents: input.cents,
      note: null,
      isOutside: false,
      undoText,
    },
  };
}

export interface UndoEnvelopeIntoHorizonInput extends EnvelopeIntoHorizonWritten {
  /** What the event holds as this device reads it; the money comes back only while it is all still there. */
  eventHeldCents: Cents;
  eventName: string;
}

/** Takes an envelope's move into an event back: the reversing transfer and the envelope open again, in one transaction. The envelope's `archivedAt` is the one write-once field this clears, and only while it still holds the day this move wrote. Resolves false when it was already undone. */
export async function undoEnvelopeIntoHorizon(
  uid: string,
  encryption: RunwayEncryption,
  input: UndoEnvelopeIntoHorizonInput,
): Promise<boolean> {
  const { move } = input;
  const id = getUndoTransferMoveId(move.moveId);
  if (move.fromId === null || move.toId === null) return false;
  const envelopeId = move.fromId;
  if (input.eventHeldCents < move.cents) {
    throw new Error(HORIZON_PLAN_WORDS.envelopeUndoShort(input.eventName));
  }
  const [sealed, change] = await Promise.all([
    sealJson(
      {
        fromId: move.fromId,
        toId: move.toId,
        cents: move.cents,
        note: null,
        isOutside: false,
      } satisfies TransferSealed,
      encryption,
    ),
    getChangeDoc(
      encryption,
      `${move.undoText}.`,
      null,
      [envelopeId, move.toId],
      {
        ...move,
        isUndo: true,
      },
    ),
  ]);
  return runTransaction(db, async (transaction) => {
    const [existing, plan, envelope] = await Promise.all([
      transaction.get(planDoc(uid, 'moves', id)),
      transaction.get(doc(db, 'apps', 'runway', 'plans', uid)),
      transaction.get(planDoc(uid, 'items', envelopeId)),
    ]);
    if (existing.exists()) return false;
    const header = envelope.data() as Partial<PlanItemDoc> | undefined;
    if (!header || (header.archivedAt ?? null) !== input.archivedAt) {
      throw new Error(HORIZON_PLAN_WORDS.envelopeUndoChanged);
    }
    markLedgerWrite(transaction, uid, plan.data(), [move.date]);
    transaction.set(planDoc(uid, 'moves', id), {
      id,
      kind: 'transfer',
      date: move.date,
      refId: envelopeId,
      reversesMoveId: move.moveId,
      createdAt: Date.now(),
      sealed,
    } satisfies MoveDoc);
    transaction.set(planDoc(uid, 'changes', change.id), change);
    transaction.update(planDoc(uid, 'items', envelopeId), { archivedAt: null });
    return true;
  });
}
