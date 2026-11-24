// Generated from src/apps/runway/engine/shareSummary.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { DateOnly, ShareSummary, Stance } from '../runwayTypes.js';

import { isSelfPaying } from './autoPay.js';
import { getFreeToSpendFigure } from './balances.js';
import { describeBillRepeat } from './billRepeat.js';
import type { ComingDay } from './comingDays.js';
import { DAY_MS, startOfUtcDay } from './dates.js';
import type { BillPayment } from './demands.js';
import type {
  CoveredBalances,
  Figures,
  getSelfPayingBills,
  ResolvedBill,
  ResolvedHorizon,
} from './figures.js';
import type { CostPaidEntry } from './horizon.js';
import { getHorizonStatus } from './horizonStatus.js';
import type { BillProgressInput } from './progress.js';

const LIST_LIMIT = 20;
const BILLS_WITHIN_DAYS = 30;
const BILLS_NEXT_WITHIN_DAYS = 365;
const PAID_LIMIT = 10;

export type SummaryFigures = Omit<ShareSummary, 'computedAt'>;

export interface ShareSummaryInput {
  today: DateOnly;
  currency: string | null;
  startDate: DateOnly | null;
  recentFrom: DateOnly | null;
  stance: Stance;
  balances: CoveredBalances;
  comingDays: readonly ComingDay[];
  dueBeforePay: { cents: number; payOn: number } | null;
  bills: readonly ResolvedBill[];
  payments: Record<string, readonly BillPayment[]>;
  progress: Record<string, BillProgressInput>;
  horizon: readonly ResolvedHorizon[];
  costPaid: Record<string, CostPaidEntry[]>;
  selfPaying: ReturnType<typeof getSelfPayingBills>;
}

/** A date-only day as 'yyyy-mm-dd', or '' for none. */
const toDayText = (timestamp?: number) =>
  !timestamp || Number.isNaN(timestamp)
    ? ''
    : new Date(timestamp).toISOString().slice(0, 10);

/** The totals-and-names summary a connected app reads, or null while the figure is unknown or the plan has no currency. */
export function buildShareSummary(
  input: ShareSummaryInput,
): SummaryFigures | null {
  const {
    today,
    currency,
    startDate,
    recentFrom,
    stance,
    balances,
    comingDays,
    dueBeforePay,
    bills,
    payments,
    progress,
    horizon,
    costPaid,
    selfPaying,
  } = input;
  const free = getFreeToSpendFigure(balances);
  if (currency === null || free.kind === 'unknown') return null;
  const soon = today + BILLS_WITHIN_DAYS * DAY_MS;
  const through = today + BILLS_NEXT_WITHIN_DAYS * DAY_MS;
  const thisMonth = toDayText(today).slice(0, 7);
  const describe = ({ version }: (typeof bills)[number]) => ({
    name: version.payload.name,
    repeats: describeBillRepeat(version.payload.timing.schedule),
    endsOn: toDayText(version.payload.ending.onDate ?? undefined) || null,
    endsAfter: version.payload.ending.afterCount,
  });
  const upcomingBills = bills
    .flatMap((bill) => {
      const since = Math.max(
        startOfUtcDay(bill.item.createdAt),
        startDate ?? 0,
        recentFrom ?? 0,
      );
      const unpaid = (payments[bill.item.id] ?? []).filter(
        ({ paid, dueOn }) =>
          paid === null && dueOn >= since && dueOn <= through,
      );
      const chosen = unpaid.some(({ dueOn }) => dueOn <= soon)
        ? unpaid.filter(({ dueOn }) => dueOn <= soon)
        : unpaid.slice(0, 1);
      const own = selfPaying[bill.item.id];
      return chosen.map(({ dueOn, totalCents }, rank) => ({
        ...describe(bill),
        amountCents: totalCents,
        dueOn,
        paidOn: null,
        paysItself: own !== undefined && isSelfPaying(own, dueOn, today),
        rank,
      }));
    })
    // Each bill's next payment is kept before any bill's later ones, so a weekly bill can't crowd out the rest.
    .sort((a, b) => a.rank - b.rank || a.dueOn - b.dueOn)
    .slice(0, LIST_LIMIT)
    .sort((a, b) => a.dueOn - b.dueOn || a.name.localeCompare(b.name))
    .map(
      ({
        name,
        repeats,
        endsOn,
        endsAfter,
        amountCents,
        dueOn,
        paysItself,
      }) => ({
        name,
        paysItself,
        repeats,
        endsOn,
        endsAfter,
        amountCents,
        dueOn: toDayText(dueOn),
        paidOn: null,
      }),
    );
  const paidBills = bills
    .flatMap((bill) =>
      (progress[bill.item.id]?.paid ?? [])
        .filter(
          ({ dueOn, paidOn }) =>
            toDayText(paidOn).startsWith(thisMonth) ||
            toDayText(dueOn).startsWith(thisMonth),
        )
        .map(({ dueOn, paidOn, amountCents }) => ({
          ...describe(bill),
          amountCents,
          dueOn,
          paidOn,
          paysItself: false,
        })),
    )
    .sort((a, b) => b.paidOn - a.paidOn || a.name.localeCompare(b.name))
    .slice(0, PAID_LIMIT)
    .map(({ dueOn, paidOn, ...rest }) => ({
      ...rest,
      dueOn: toDayText(dueOn),
      paidOn: toDayText(paidOn),
    }));
  return {
    currency,
    freeToSpendCents: balances.freeToSpendCents,
    nextIncomeOn: comingDays[0] ? toDayText(comingDays[0].on) : null,
    dueBeforeIncomeCents: dueBeforePay?.cents ?? 0,
    bills: [...paidBills, ...upcomingBills],
    horizon: horizon.slice(0, LIST_LIMIT).map(({ item, version }) => {
      const status = getHorizonStatus(
        version.payload,
        balances.assignedByItem[item.id] ?? 0,
        today,
        stance,
        costPaid[item.id],
        balances.costPaidByItem[item.id] ?? 0,
        balances.costFromFreeByItem[item.id] ?? 0,
      );
      return {
        name: version.payload.name,
        targetCents: status.plannedCents,
        setAsideCents: status.figures.setAsideCents,
        targetOn: toDayText(version.payload.happensOn) || null,
      };
    }),
  };
}

/** What the summary reads, from the figures worked out for a plan and the few facts beside them. */
export const toShareSummaryInput = (
  figures: Figures,
  context: Pick<
    ShareSummaryInput,
    'today' | 'currency' | 'startDate' | 'recentFrom'
  >,
): ShareSummaryInput => ({
  ...context,
  stance: figures.detail.stance,
  balances: figures.balances,
  comingDays: figures.detail.comingDays,
  dueBeforePay: figures.dueBeforePay,
  bills: figures.detail.bills,
  payments: figures.detail.payments,
  progress: figures.detail.progress,
  horizon: figures.detail.horizon,
  costPaid: figures.detail.costPaid,
  selfPaying: figures.detail.selfPaying,
});
