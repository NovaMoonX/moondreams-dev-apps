import { collection, getDocsFromServer } from 'firebase/firestore';

import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { db } from '@lib/firebase/config';
import { ENVELOPE_ORDER_STEP, PRIORITIES } from '@apps/runway/constants';
import {
  createBill,
  createEnvelope,
  createGoal,
  createIncome,
} from '@apps/runway/store/actions/itemActions';
import { recordHolding } from '@apps/runway/store/actions/moveActions';
import { resolveGroupChoice } from '@apps/runway/utils/groupChoice';
import type { StartDraft } from '@apps/runway/utils/startDraft';
import type { Priority, RunwayEncryption } from '@apps/runway/types';

/** What the plan already holds, by name, so a draft never adds a second one. */
export interface ExistingNames {
  sources: string[];
  bills: string[];
  envelopes: string[];
  goals: string[];
  /** The plan's groups, so a name a bill is for joins the one that has it. */
  groups: { id: string; name: string }[];
  /** The highest rank used in each tier by any bill, envelope or goal, so added items sort after them. */
  topRanks: Record<Priority, number>;
  /** The plan's starting day, when it has one. */
  startDate: number | null;
  /** How many item documents the app holds, so a plan still being read from a cold cache is not taken for an empty one. */
  itemCount: number;
}

/** The plan on the server holds more than the app has read so far. */
export class DraftPlanNotReady extends Error {}

export interface DraftCommitResult {
  added: number;
  skipped: number;
  /** The ids of the draft's entries that were written. */
  addedIds: string[];
  /** Goals whose starting amount did not record; they were added without it. */
  unrecordedHoldings: string[];
}

/** A write failed part way: what was written stays written, and `result` says which entries those were. */
export class DraftPartialWrite extends Error {
  result: DraftCommitResult;
  constructor(result: DraftCommitResult, cause: unknown) {
    super('Only part of the draft was written', { cause });
    this.result = result;
  }
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
  const confirmed = await getDocsFromServer(
    collection(db, 'apps', 'runway', 'plans', uid, 'items'),
  );
  if (confirmed.size !== existing.itemCount) throw new DraftPlanNotReady();
  const result: DraftCommitResult = {
    added: 0,
    skipped: 0,
    addedIds: [],
    unrecordedHoldings: [],
  };
  const ranks = { ...existing.topRanks };
  const nextRank = (priority: Priority) => {
    ranks[priority] += ENVELOPE_ORDER_STEP;
    return ranks[priority];
  };
  const taken = {
    bills: new Set(existing.bills.map(norm)),
    envelopes: new Set(existing.envelopes.map(norm)),
    goals: new Set(existing.goals.map(norm)),
  };
  const sourceIds = new Map<string, string>();
  const madeGroups: { id: string; name: string }[] = [];
  const toGroup = (
    forName: string | null | undefined,
    forEmoji: string | null | undefined,
  ) => {
    const choice = resolveGroupChoice(NEW_CHOICE, forName ?? '', [
      ...existing.groups,
      ...madeGroups,
    ]);
    return choice.newGroup === null
      ? choice
      : {
          ...choice,
          newGroup: { ...choice.newGroup, emoji: forEmoji?.trim() || null },
        };
  };
  const rememberGroup = (
    made: { name: string } | null,
    groupId: string | null,
  ) => {
    if (made !== null && groupId !== null)
      madeGroups.push({ id: groupId, name: made.name });
  };

  try {
    for (const { id, value } of draft.incomes) {
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
      result.addedIds.push(id);
    }
    for (const { id, value, forName, forEmoji } of draft.bills) {
      if (taken.bills.has(norm(value.name))) {
        result.skipped += 1;
        continue;
      }
      const { groupId, newGroup } = toGroup(forName, forEmoji);
      const created = await createBill(uid, encryption, {
        startDate: today,
        bill: { ...value, groupId, orderIndex: nextRank(value.priority) },
        newGroup,
      });
      rememberGroup(newGroup, created.groupId);
      taken.bills.add(norm(value.name));
      result.added += 1;
      result.addedIds.push(id);
    }
    const mapFunding = <F extends { sourceId?: string | null }>(
      funding: F,
    ): F => {
      const id = funding.sourceId ?? null;
      if (id === null || !id.startsWith('draft:')) return funding;
      const real = sourceIds.get(id.slice('draft:'.length)) ?? null;
      return { ...funding, sourceId: real };
    };
    for (const { id, value, forName, forEmoji } of draft.envelopes) {
      if (taken.envelopes.has(norm(value.name))) {
        result.skipped += 1;
        continue;
      }
      const { groupId, newGroup } = toGroup(forName, forEmoji);
      const created = await createEnvelope(uid, encryption, {
        startDate: today,
        envelope: {
          ...value,
          groupId,
          funding: mapFunding(value.funding),
          orderIndex: nextRank(value.priority),
        },
        newGroup,
      });
      rememberGroup(newGroup, created.groupId);
      taken.envelopes.add(norm(value.name));
      result.added += 1;
      result.addedIds.push(id);
    }
    for (const { id, value } of draft.goals) {
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
          funding: mapFunding(value.funding),
          orderIndex: nextRank(value.priority),
          ...(hasStartDay ? { startingCents: undefined } : {}),
        },
      });
      if (existing.startDate !== null && startingCents > 0) {
        const isRecorded = await recordHolding(
          uid,
          encryption,
          existing.startDate,
          {
            holding: 'goal',
            refId: goalId,
            amountCents: startingCents,
          },
        ).catch((error) => {
          console.error(error);
          return false;
        });
        if (!isRecorded) result.unrecordedHoldings.push(value.name);
      }
      taken.goals.add(norm(value.name));
      result.added += 1;
      result.addedIds.push(id);
    }
  } catch (error) {
    if (result.added === 0) throw error;
    throw new DraftPartialWrite(result, error);
  }
  return result;
}

export const EMPTY_TIER_RANKS: Record<Priority, number> = Object.fromEntries(
  PRIORITIES.map((priority) => [priority, 0]),
) as Record<Priority, number>;

/** The highest rank used in each priority tier of a list of items. */
export const toTopRanks = (
  list: { version: { payload: { priority: Priority; orderIndex: number } } }[],
) =>
  list.reduce<Record<Priority, number>>(
    (acc, { version }) => ({
      ...acc,
      [version.payload.priority]: Math.max(
        acc[version.payload.priority],
        version.payload.orderIndex,
      ),
    }),
    { ...EMPTY_TIER_RANKS },
  );
