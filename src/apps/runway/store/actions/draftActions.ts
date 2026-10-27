import { ENVELOPE_ORDER_STEP, PRIORITIES } from '@apps/runway/constants';
import {
  createBill,
  createEnvelope,
  createGoal,
  createIncome,
} from '@apps/runway/store/actions/itemActions';
import { recordHolding } from '@apps/runway/store/actions/moveActions';
import type { StartDraft } from '@apps/runway/utils/startDraft';
import type { Priority, RunwayEncryption } from '@apps/runway/types';

/** What the plan already holds, by name, so a draft never adds a second one. */
export interface ExistingNames {
  sources: string[];
  bills: string[];
  envelopes: string[];
  goals: string[];
  /** The tier ranks already used, so added items sort after them. */
  topRanks: Record<'bills' | 'envelopes' | 'goals', Record<Priority, number>>;
  /** The plan's starting day, when it has one. */
  startDate: number | null;
}

export interface DraftCommitResult {
  added: number;
  skipped: number;
}

const norm = (name: string) => name.trim().toLowerCase();

/** Writes the draft to the plan with the normal actions, an item at a time, skipping names the plan already has. */
export async function commitStartDraft(
  uid: string,
  encryption: RunwayEncryption,
  draft: StartDraft,
  existing: ExistingNames,
  today: number,
): Promise<DraftCommitResult> {
  const result = { added: 0, skipped: 0 };
  const ranks = {
    bills: { ...existing.topRanks.bills },
    envelopes: { ...existing.topRanks.envelopes },
    goals: { ...existing.topRanks.goals },
  };
  const nextRank = (kind: keyof typeof ranks, priority: Priority) => {
    ranks[kind][priority] += ENVELOPE_ORDER_STEP;
    return ranks[kind][priority];
  };
  const taken = {
    bills: new Set(existing.bills.map(norm)),
    envelopes: new Set(existing.envelopes.map(norm)),
    goals: new Set(existing.goals.map(norm)),
  };
  const sourceIds = new Map<string, string>();

  for (const { value } of draft.incomes) {
    const key = norm(value.sourceName);
    if (existing.sources.map(norm).includes(key) && !sourceIds.has(key)) {
      result.skipped += 1;
      continue;
    }
    const { sourceId } = await createIncome(uid, encryption, {
      ...value,
      sourceId: sourceIds.get(key) ?? null,
    });
    sourceIds.set(key, sourceId);
    result.added += 1;
  }
  for (const { value } of draft.bills) {
    if (taken.bills.has(norm(value.name))) {
      result.skipped += 1;
      continue;
    }
    await createBill(uid, encryption, {
      startDate: today,
      bill: { ...value, orderIndex: nextRank('bills', value.priority) },
    });
    result.added += 1;
  }
  for (const { value } of draft.envelopes) {
    if (taken.envelopes.has(norm(value.name))) {
      result.skipped += 1;
      continue;
    }
    await createEnvelope(uid, encryption, {
      startDate: today,
      envelope: {
        ...value,
        orderIndex: nextRank('envelopes', value.priority),
      },
    });
    result.added += 1;
  }
  for (const { value } of draft.goals) {
    if (taken.goals.has(norm(value.name))) {
      result.skipped += 1;
      continue;
    }
    const startingCents = value.startingCents ?? 0;
    const hasStartDay = existing.startDate !== null;
    const { goalId } = await createGoal(uid, encryption, {
      startDate: today,
      goal: {
        ...value,
        orderIndex: nextRank('goals', value.priority),
        ...(hasStartDay ? { startingCents: undefined } : {}),
      },
    });
    if (existing.startDate !== null && startingCents > 0) {
      await recordHolding(uid, encryption, existing.startDate, {
        holding: 'goal',
        refId: goalId,
        amountCents: startingCents,
      }).catch((error) => console.error(error));
    }
    result.added += 1;
  }
  return result;
}

export const EMPTY_TIER_RANKS: Record<Priority, number> = Object.fromEntries(
  PRIORITIES.map((priority) => [priority, 0]),
) as Record<Priority, number>;
