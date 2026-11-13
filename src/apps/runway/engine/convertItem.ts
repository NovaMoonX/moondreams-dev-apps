import type {
  Cents,
  DateOnly,
  EnvelopeSealed,
  FundingRule,
  GoalSealed,
  OpenChange,
  OpenMove,
  OpenPurchase,
  OpenVersion,
} from '@apps/runway/types';

/** What a goal that is paused starts as once it is an envelope, which has no pause: nothing goes in for now. */
const IDLE_FUNDING: FundingRule = {
  amount: { kind: 'exact', cents: 0 },
  cadence: { kind: 'none' },
};

/** The goal an envelope becomes: its name, look, priority, place, group, funding and extras carry over, its limit, overflow and starting amount do not (the money arrives by a move). */
export function toGoalPayload(
  envelope: EnvelopeSealed,
  ask: { targetCents: Cents; targetDate: DateOnly | null },
): GoalSealed {
  return {
    name: envelope.name,
    emoji: envelope.emoji,
    priority: envelope.priority,
    orderIndex: envelope.orderIndex,
    targetCents: ask.targetCents,
    targetDate: ask.targetDate,
    funding: envelope.funding,
    startingCents: null,
    state: 'active',
    extras: envelope.extras ?? null,
    groupId: envelope.groupId,
  };
}

/** The envelope a goal becomes: everything but its target and date carries over. A paused goal becomes one nothing goes in for, with its extras off, since an extra rides on the days its amount does. */
export function toEnvelopePayload(goal: GoalSealed): EnvelopeSealed {
  const isPaused = goal.state === 'paused';
  return {
    name: goal.name,
    emoji: goal.emoji,
    priority: goal.priority,
    orderIndex: goal.orderIndex,
    funding: isPaused ? IDLE_FUNDING : goal.funding,
    maxCents: null,
    groupId: goal.groupId,
    spillTo: [],
    startingCents: null,
    extras: isPaused ? null : (goal.extras ?? null),
  };
}

/** A target the goal already holds: it is reached at once, as a goal that holds all of it reads "Completed". */
export const isReachedAtOnce = (targetCents: Cents, heldCents: Cents) =>
  targetCents > 0 && heldCents >= targetCents;

export interface ConvertedHistoryInput {
  newItemId: string;
  /** The conversion's own move and change entry, which are not later history. */
  ownMoveId: string;
  ownChangeId: string;
  versions: readonly Pick<OpenVersion, 'itemId'>[];
  moves: readonly OpenMove[];
  purchases: readonly Pick<OpenPurchase, 'lines'>[];
  changes: readonly Pick<OpenChange, 'id' | 'itemIds'>[];
}

/** Whether the item a conversion made has history of its own since: another version, a move, a purchase or a change entry. A conversion is taken back only while it has none. */
export function hasLaterHistory(input: ConvertedHistoryInput): boolean {
  const { newItemId } = input;
  return (
    input.versions.filter((version) => version.itemId === newItemId).length >
      1 ||
    input.moves.some(
      (move) =>
        move.id !== input.ownMoveId &&
        (move.refId === newItemId ||
          (move.kind === 'transfer' &&
            (move.payload.fromId === newItemId ||
              move.payload.toId === newItemId))),
    ) ||
    input.purchases.some((purchase) =>
      purchase.lines.some((line) => line.envelopeId === newItemId),
    ) ||
    input.changes.some(
      (change) =>
        change.id !== input.ownChangeId && change.itemIds.includes(newItemId),
    )
  );
}
