import type {
  Cents,
  FundingRule,
  Priority,
  PriorityExtra,
} from '@apps/runway/types';

import { getCalendarCents } from './calendar';
import { percentOf } from './money';
import { selectRuleDays } from './schedule';

export const TIER_RANK: Record<Priority, number> = {
  must: 0,
  should: 1,
  want: 2,
};

/** One priority level of an envelope's or goal's ask; `part` null is its own amount at its own priority. */
export interface ItemPart {
  part: Priority | null;
  tier: Priority;
  orderIndex: number;
  /** What it asks for per income day, or per period on a calendar rule. */
  cents: Cents;
}

interface Splittable {
  priority: Priority;
  orderIndex: number;
  funding: FundingRule;
  extras?: readonly PriorityExtra[] | null;
}

/** Whether a rule can carry extras: an exact amount on days or a calendar, never a share of pay or the rest. */
export const canHaveExtras = (funding: FundingRule) =>
  funding.amount.kind === 'exact' && funding.cadence.kind !== 'none';

/** The extras that count: each below the item's own priority, one per level, more than zero, in funding order. */
export function getExtras(item: Splittable): PriorityExtra[] {
  if (!canHaveExtras(item.funding)) return [];
  const result = (item.extras ?? [])
    .filter(
      (extra, index, all) =>
        extra.cents > 0 &&
        TIER_RANK[extra.tier] > TIER_RANK[item.priority] &&
        all.findIndex((other) => other.tier === extra.tier) === index,
    )
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  return result;
}

/** The item's own amount first, then each extra, in the order the money reaches them. */
export function getParts(item: Splittable): ItemPart[] {
  const own: ItemPart = {
    part: null,
    tier: item.priority,
    orderIndex: item.orderIndex,
    cents: item.funding.amount.kind === 'exact' ? item.funding.amount.cents : 0,
  };
  const result = [
    own,
    ...getExtras(item).map((extra): ItemPart => ({
      part: extra.tier,
      tier: extra.tier,
      orderIndex: extra.orderIndex,
      cents: extra.cents,
    })),
  ];
  return result;
}

/** The rule with every part's amount added, which caps (a max, a target) walk against. */
export function withExtras(item: Splittable): FundingRule {
  const extras = getExtras(item);
  if (extras.length === 0 || item.funding.amount.kind !== 'exact')
    return item.funding;
  const cents =
    item.funding.amount.cents +
    extras.reduce((sum, extra) => sum + extra.cents, 0);
  return { ...item.funding, amount: { kind: 'exact', cents } };
}

/** The rule counting only the parts at `level` or above; nothing when the item's own amount is below it. */
export function fundingAtLevel(
  item: Splittable,
  level: Priority,
): FundingRule | null {
  if (TIER_RANK[item.priority] > TIER_RANK[level]) return null;
  const counted = getExtras(item).filter(
    (extra) => TIER_RANK[extra.tier] <= TIER_RANK[level],
  );
  return withExtras({ ...item, extras: counted });
}

/** What each part asks of each funded day (a calendar rule spreads each part over its period); null without extras. */
export function getPartAsks(
  item: Splittable,
  funded: readonly { dayKey: string; on: number; sourceId?: string | null }[],
  priorDays: readonly {
    dayKey: string;
    on: number;
    sourceId?: string | null;
  }[],
): ((dayKey: string) => Cents[]) | null {
  const parts = getParts(item);
  if (parts.length === 1) return null;
  const calendars = parts.map((part) =>
    getCalendarCents(
      { ...item.funding, amount: { kind: 'exact', cents: part.cents } },
      funded,
      priorDays,
    ),
  );
  return (dayKey) =>
    parts.map((part, index) => {
      const calendar = calendars[index];
      return calendar ? (calendar.get(dayKey) ?? 0) : part.cents;
    });
}

/** Shares a day's capped total across its parts in funding order, so a cap trims the lowest part first. */
export function splitAcrossParts(
  asks: readonly Cents[],
  cents: Cents,
): Cents[] {
  const result = asks.reduce<{ left: Cents; shares: Cents[] }>(
    (acc, ask) => {
      const share = Math.min(ask, acc.left);
      return { left: acc.left - share, shares: [...acc.shares, share] };
    },
    { left: cents, shares: [] },
  ).shares;
  return result;
}

/** A line's id: the item's own on a day, or one per extra level. */
export const getLineId = (
  dayKey: string,
  itemId: string,
  part: Priority | null = null,
) => (part === null ? `${dayKey}:${itemId}` : `${dayKey}:${itemId}:${part}`);

/** A Horizon cost's line on a day: one per cost, so an item with several costs shows one row for each; the line that gives back what a fronted payment took is its own. */
export const getCostLineId = (
  dayKey: string,
  itemId: string,
  costId: string,
  repaysFree = false,
) => `${dayKey}:${itemId}:cost:${costId}${repaysFree ? ':free' : ''}`;

/** Where a day keeps what a pay was told to put toward one cost, beside a bill's id in the same overrides. */
export const getCostShareKey = (itemId: string, costId: string) =>
  `${itemId}:${costId}`;

/** Where a cost's own name ("Moving") sits among the names of a draft's items. */
export const getCostNameKey = (itemId: string, costId: string) =>
  `${itemId}:cost:${costId}`;

/** A line's name: an item split into parts names each by its level ("Groceries · must", "Groceries · want"); an unsplit item keeps its name. */
export function getPartName(
  name: string,
  line: {
    itemId: string;
    dayKey?: string;
    part?: Priority | null;
    tier: Priority;
  },
  lines: readonly {
    itemId: string;
    dayKey?: string;
    part?: Priority | null;
  }[],
): string {
  const isSplit =
    (line.part ?? null) !== null ||
    lines.some(
      (other) =>
        other.itemId === line.itemId &&
        other.dayKey === line.dayKey &&
        (other.part ?? null) !== null,
    );
  return isSplit && name !== '' ? `${name} · ${line.tier}` : name;
}

/** An envelope's or goal's funding from one date on. */
export interface FundingRun {
  /** First day it applies; `-Infinity` for the earliest. */
  from: number;
  priority: Priority;
  funding: FundingRule;
  extras: readonly PriorityExtra[] | null;
}

/**
 * What each day asked of an item under the funding in force on its own date, so a walk over earlier
 * days reads each one's own amount and not the drafted day's. Which days count stays the drafted
 * rule's. Null when the item's funding never changed.
 */
export function getRunAsker<
  D extends { dayKey: string; on: number; moneyCents?: Cents },
>(
  runs: readonly FundingRun[] | undefined,
  days: readonly D[],
  priorDays: readonly { dayKey: string; on: number }[],
): ((day: D) => Cents) | null {
  if (!runs || runs.length < 2) return null;
  const askers = runs.map((run) => {
    const funded = selectRuleDays(run.funding, days);
    const keys = new Set(funded.map((day) => day.dayKey));
    const calendar = getCalendarCents(run.funding, funded, priorDays);
    const partAsks = getPartAsks(
      {
        priority: run.priority,
        orderIndex: 0,
        funding: run.funding,
        extras: run.extras,
      },
      funded,
      priorDays,
    );
    const { amount } = run.funding;
    const ask = (day: D): Cents => {
      if (!keys.has(day.dayKey)) return 0;
      if (partAsks) return partAsks(day.dayKey).reduce((a, b) => a + b, 0);
      if (calendar) return calendar.get(day.dayKey) ?? 0;
      if (amount.kind === 'exact') return amount.cents;
      return amount.kind === 'percent'
        ? percentOf(day.moneyCents ?? 0, amount.bps)
        : 0;
    };
    return { from: run.from, ask };
  });
  const result = (day: D): Cents =>
    (
      askers.reduce<(typeof askers)[number] | null>(
        (found, entry) => (entry.from <= day.on ? entry : found),
        null,
      ) ?? askers[0]
    ).ask(day);
  return result;
}
