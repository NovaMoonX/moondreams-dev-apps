import type {
  Cents,
  CostPaidMark,
  DateOnly,
  HorizonCost,
  HorizonMoneyLeft,
  HorizonSealed,
  HorizonState,
  HorizonStored,
  MoneyRange,
  Schedule,
  Stance,
} from '@apps/runway/types';

import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';

import { addUtcMonths, DAY_MS } from './dates';
import { getIntervalMonths, occurrences } from './schedule';
import { pick } from './stance';

/** A cost's payment marked paid and not undone. */
export interface CostPaidEntry {
  moveId: string;
  costId: string;
  dueOn: DateOnly;
  /** What it came to; it replaces the planned figure wherever the payment is counted. */
  amountCents: Cents;
  paidOn: DateOnly;
  /** The part beyond what the item held, out of Free to Spend. */
  fromFreeCents: Cents;
  mark: CostPaidMark;
  purchaseId: string | null;
}

/** One time a cost asks for money. */
export interface CostPayment {
  costId: string;
  dueOn: DateOnly;
  /** The amount the stance plans: a range reads at its expense end; what it came to once it is paid. */
  totalCents: Cents;
  /** The live mark that settled it; null while it is unpaid. */
  paid: CostPaidEntry | null;
}

/** A cost's payments through `horizon`, soonest first; one in `paid` carries its mark and what it came to. */
export function listCostPayments(
  cost: HorizonCost,
  horizon: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
): CostPayment[] {
  const planned = pick(stance, cost.amount, 'expense');
  const markOf = (dueOn: DateOnly) =>
    paid.find((entry) => entry.costId === cost.id && entry.dueOn === dueOn) ??
    null;
  const result = occurrences(cost.schedule, cost.ending, 0, horizon)
    .filter(
      (dueOn) =>
        markOf(dueOn) !== null ||
        ((cost.endsAfter === null || dueOn <= cost.endsAfter) &&
          (cost.becameBillOn === null || dueOn < cost.becameBillOn)),
    )
    .map((dueOn) => {
      const mark = markOf(dueOn);
      return {
        costId: cost.id,
        dueOn,
        totalCents: mark ? mark.amountCents : planned,
        paid: mark,
      };
    });
  return result;
}

/** The day a repeating cost's first payment looks back to for its pays: one beat before it, so a monthly cost due Feb 1st asks the pays since Jan 1st. Null for a cost paid once, whose pays are every one before it. */
export function getPriorBeat(schedule: Schedule): DateOnly | null {
  const { anchor } = schedule;
  if (anchor === null || schedule.kind === 'once') return null;
  if (schedule.kind === 'weekly') return anchor - 7 * DAY_MS;
  if (schedule.kind === 'everyOtherWeek') return anchor - 14 * DAY_MS;
  const months = getIntervalMonths(schedule) ?? 1;
  return addUtcMonths(anchor, -months);
}

/** Every cost's payments through `horizon` in date order, ties in the order the costs were listed. An event that is finished or called off plans none: only the payments marked paid stay. */
export const listHorizonPayments = (
  costs: readonly HorizonCost[],
  horizon: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
  state: HorizonState = 'open',
): CostPayment[] =>
  costs
    .flatMap((cost) => listCostPayments(cost, horizon, stance, paid))
    .filter((payment) => state === 'open' || payment.paid !== null)
    .sort((a, b) => a.dueOn - b.dueOn);

/** What the payments through `horizon` add up to. */
export const sumCostPayments = (payments: readonly CostPayment[]): Cents =>
  payments.reduce((sum, { totalCents }) => sum + totalCents, 0);

/** Where a payment of `amountCents` takes its money: the item's, up to what it holds, and Free to Spend for the rest. A mark that moves nothing (outside the plan, or by a purchase) takes none. */
export function settleCostPaid(
  amountCents: Cents,
  heldCents: Cents,
  mark: CostPaidMark = 'item',
) {
  if (mark !== 'item') return { fromItemCents: 0, fromFreeCents: 0 };
  const fromItemCents = Math.min(amountCents, Math.max(0, heldCents));
  return { fromItemCents, fromFreeCents: amountCents - fromItemCents };
}

/** A cost whose amount is a range is marked with what it came to, never the planned figure. */
export const needsCostAmount = (cost: Pick<HorizonCost, 'amount'>) =>
  cost.amount.lowCents !== cost.amount.highCents;

/** What marked payments took out of the item's money: only a mark made from it counts, so a payment outside the plan is not spent. */
export const sumCostSpent = (paid: readonly CostPaidEntry[]): Cents =>
  paid.reduce(
    (sum, entry) => (entry.mark === 'item' ? sum + entry.amountCents : sum),
    0,
  );

/** The payments of costs paid outside the plan that nobody has marked, soonest first. Until each is marked the item is not ready to finish, whatever its date. */
export const listUnmarkedOutside = (
  costs: readonly HorizonCost[],
  horizon: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
): CostPayment[] =>
  listHorizonPayments(
    costs.filter(({ isOutside }) => isOutside),
    horizon,
    stance,
    paid,
  ).filter((payment) => payment.paid === null);

/** A stored payload with the fields later issues added filled in, so a version sealed before them reads as it always meant. */
export const readHorizon = (stored: HorizonStored): HorizonSealed => ({
  ...stored,
  rest: stored.rest ?? { kind: 'later' },
  costs: stored.costs.map((cost) => ({
    ...cost,
    isOutside: cost.isOutside ?? false,
    ending: cost.ending ?? { onDate: null, afterCount: null },
    pricedOn: cost.pricedOn ?? null,
    endsAfter: cost.endsAfter ?? null,
    becameBillId: cost.becameBillId ?? null,
    becameBillOn: cost.becameBillOn ?? null,
  })),
  state: stored.state ?? 'open',
  stateOn: stored.stateOn ?? null,
  stateMoney: stored.stateMoney ?? null,
});

/** The due dates of a repeating payment's first occurrences from `from` that `heldCents` covers in full, soonest first. */
export function listCoveredFrom(
  schedule: Schedule,
  amount: MoneyRange,
  from: DateOnly,
  heldCents: Cents,
  stance: Stance,
): DateOnly[] {
  const payment = pick(stance, amount, 'expense');
  if (payment <= 0) return [];
  const dues = occurrences(
    schedule,
    { onDate: null, afterCount: null },
    from,
    addUtcMonths(from, LOOKAHEAD_MONTHS),
  );
  return dues.reduce<{ left: Cents; covered: DateOnly[] }>(
    (walk, dueOn) =>
      walk.left >= payment
        ? { left: walk.left - payment, covered: [...walk.covered, dueOn] }
        : walk,
    { left: Math.max(0, heldCents), covered: [] },
  ).covered;
}

/** The id of the bill a cost becomes: one per cost, so two devices making the same cost a bill write the same document and the second is refused. */
export const getMadeBillId = (itemId: string, costId: string) =>
  `bill_${itemId}_${costId}`;

/** What the item holds that is this cost's to bring: its held money less what the unpaid payments of its other live costs paid inside the plan still need, never below zero or above what it holds. */
export function getCostShare(
  horizon: Pick<HorizonSealed, 'costs'>,
  costId: string,
  heldCents: Cents,
  payments: readonly CostPayment[],
): Cents {
  const held = Math.max(0, heldCents);
  const others = new Set(
    horizon.costs
      .filter(
        (cost) =>
          cost.id !== costId &&
          cost.endsAfter === null &&
          !cost.isOutside &&
          cost.becameBillId === null,
      )
      .map(({ id }) => id),
  );
  const needed = payments.reduce(
    (sum, { costId: id, paid, totalCents }) =>
      others.has(id) && paid === null ? sum + totalCents : sum,
    0,
  );
  return Math.min(held, Math.max(0, held - needed));
}

/** Whether another live cost of the item, paid inside the plan and not yet a bill, has a payment still to come or to pay, however far off. */
export function hasOtherOpenCost(
  horizon: Pick<HorizonSealed, 'costs'>,
  costId: string,
  today: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
): boolean {
  const farOn = addUtcMonths(today, 120);
  return horizon.costs.some(
    (cost) =>
      cost.id !== costId &&
      cost.endsAfter === null &&
      !cost.isOutside &&
      cost.becameBillId === null &&
      listCostPayments(cost, farOn, stance, paid).some(
        ({ paid: mark }) => mark === null,
      ),
  );
}

/** Why a cost cannot be made a bill yet, or null when it can: a later payment already marked paid has to be taken back, and an unpaid payment already past has to be paid or marked first, because the bill starts at the cost's next unpaid payment. */
export function getMakeBillBlock(
  payments: readonly CostPayment[],
  today: DateOnly,
): { kind: 'laterPaid' | 'pastDue'; dueOn: DateOnly } | null {
  const next = payments.find(({ paid }) => paid === null);
  if (!next) return null;
  const laterPaid = payments.find(
    ({ dueOn, paid }) => paid !== null && dueOn > next.dueOn,
  );
  if (laterPaid) return { kind: 'laterPaid', dueOn: laterPaid.dueOn };
  return next.dueOn < today ? { kind: 'pastDue', dueOn: next.dueOn } : null;
}

/** The item with a cost handed to the bill that now plans its payments from `billOn`. */
export const setCostBill = (
  horizon: HorizonSealed,
  costId: string,
  billId: string,
  billOn: DateOnly,
): HorizonSealed => ({
  ...horizon,
  costs: horizon.costs.map((cost) =>
    cost.id === costId
      ? { ...cost, becameBillId: billId, becameBillOn: billOn }
      : cost,
  ),
});

/** The item with one cost's amount set and the day it was priced; unchanged when the cost is not in it. */
export const setCostPrice = (
  horizon: HorizonSealed,
  costId: string,
  amount: MoneyRange,
  pricedOn: DateOnly,
): HorizonSealed => ({
  ...horizon,
  costs: horizon.costs.map((cost) =>
    cost.id === costId ? { ...cost, amount, pricedOn } : cost,
  ),
});

/** The cost fields a cost's Change form owns; its price, the day it was priced and where it ended stay as they are. */
export type CostChange = Pick<
  HorizonCost,
  'name' | 'schedule' | 'ending' | 'isOutside'
>;

/** The item with one cost's name, schedule, ending and paid-outside answer replaced; null when the cost is no longer in it. */
export const changeCost = (
  horizon: HorizonSealed,
  costId: string,
  fields: CostChange,
): HorizonSealed | null =>
  horizon.costs.some(({ id }) => id === costId)
    ? {
        ...horizon,
        costs: horizon.costs.map((cost) =>
          cost.id === costId
            ? {
                ...cost,
                name: fields.name,
                schedule: fields.schedule,
                ending: fields.ending,
                isOutside: fields.isOutside,
              }
            : cost,
        ),
      }
    : null;

/** The costs still asking for money; one that ended after a paid payment stays listed but is not counted. */
export const getLiveCosts = (horizon: Pick<HorizonSealed, 'costs'>) =>
  horizon.costs.filter(({ endsAfter }) => endsAfter === null);

/** The item without a cost, or null when that is its last live cost (the item is then called off, not emptied). A cost with a paid payment stays, ending after `today`, so what it already took stays in Spent. */
export const removeCost = (
  horizon: HorizonSealed,
  costId: string,
  today: DateOnly,
  hasPaidPayment: boolean,
): HorizonSealed | null =>
  getLiveCosts(horizon).length <= 1 ||
  !getLiveCosts(horizon).some(({ id }) => id === costId)
    ? null
    : {
        ...horizon,
        costs: hasPaidPayment
          ? horizon.costs.map((cost) =>
              cost.id === costId ? { ...cost, endsAfter: today } : cost,
            )
          : horizon.costs.filter(({ id }) => id !== costId),
      };

/** The item with a removed cost put back at its old place; null when a cost with that id is already in it. */
export const restoreCost = (
  horizon: HorizonSealed,
  cost: HorizonCost,
  index: number,
): HorizonSealed | null =>
  horizon.costs.some(({ id }) => id === cost.id)
    ? null
    : {
        ...horizon,
        costs: [
          ...horizon.costs.slice(0, index),
          cost,
          ...horizon.costs.slice(index),
        ],
      };

/** How much of one payment the money held covers. */
export interface HorizonCover {
  costId: string;
  dueOn: DateOnly;
  coveredCents: Cents;
  totalCents: Cents;
}

export interface HorizonShortfall {
  /** The cost whose payment is the first the money does not cover. */
  costId: string;
  /** What that payment is planned at. */
  paymentCents: Cents;
  /** What was left of the money held when that payment's turn came. */
  availableCents: Cents;
  /** The due date of the first payment the money does not cover. */
  dueOn: DateOnly;
  /** What that payment lacks. */
  shortCents: Cents;
  /** What every payment through the lookahead lacks. */
  totalShortCents: Cents;
}

export interface HorizonPlan {
  /** Each unpaid payment of a cost paid inside the plan, in due order. */
  covers: HorizonCover[];
  /** The due date of the first payment not covered in full; null when all are. */
  coveredUntil: DateOnly | null;
  /** Only for an item whose rest is decided later, and only when something runs short. */
  shortfall: HorizonShortfall | null;
}

/** Walks the money held over the unpaid payments in due order, ties by cost id; the input order changes nothing. */
export function planHorizon(
  item: Pick<HorizonSealed, 'rest'> & { costs: readonly HorizonCost[] },
  heldCents: Cents,
  payments: readonly CostPayment[],
): HorizonPlan {
  const outsideIds = new Set(
    item.costs.filter(({ isOutside }) => isOutside).map(({ id }) => id),
  );
  const ordered = payments
    .filter(({ costId, paid }) => paid === null && !outsideIds.has(costId))
    .sort((a, b) => a.dueOn - b.dueOn || a.costId.localeCompare(b.costId));
  const covers = ordered.reduce<{ left: Cents; list: HorizonCover[] }>(
    (walk, { costId, dueOn, totalCents }) => {
      const coveredCents = Math.min(totalCents, walk.left);
      return {
        left: walk.left - coveredCents,
        list: [...walk.list, { costId, dueOn, coveredCents, totalCents }],
      };
    },
    { left: Math.max(0, heldCents), list: [] },
  ).list;
  const short = covers.filter(
    ({ coveredCents, totalCents }) => coveredCents < totalCents,
  );
  const [first] = short;
  const shortfall: HorizonShortfall | null =
    item.rest.kind === 'later' && first
      ? {
          costId: first.costId,
          paymentCents: first.totalCents,
          availableCents: first.coveredCents,
          dueOn: first.dueOn,
          shortCents: first.totalCents - first.coveredCents,
          totalShortCents: short.reduce(
            (sum, { coveredCents, totalCents }) =>
              sum + totalCents - coveredCents,
            0,
          ),
        }
      : null;
  return { covers, coveredUntil: first?.dueOn ?? null, shortfall };
}

/** What a purchase-made mark reads as once the purchase may have been edited: the purchase's own amount and day, and of it the part the item could not cover (the item's Free to Spend share, capped at the amount). The mark's own figures stand while the purchase isn't loaded. */
export const getPurchaseMarkFigures = <
  T extends { amountCents: Cents; fromFreeCents: Cents; paidOn: number },
>(
  mark: T,
  purchase: { amountCents: Cents; date: number } | null,
  itemFromFreeCents: Cents,
): T =>
  purchase === null
    ? mark
    : {
        ...mark,
        amountCents: purchase.amountCents,
        paidOn: purchase.date,
        fromFreeCents: Math.min(
          purchase.amountCents,
          Math.max(0, itemFromFreeCents),
        ),
      };

/** An item's three figures. Left is what the ledger holds for it; what its payments took from the item is added back to give what was set aside, so the part Free to Spend fronted is not counted as set aside. */
export const getHorizonFigures = (
  leftCents: Cents,
  spentCents: Cents = 0,
  fromFreeCents: Cents = 0,
) => ({
  setAsideCents: leftCents + spentCents - fromFreeCents,
  spentCents,
  fromFreeCents,
  leftCents,
});

/** How far ahead "every payment is settled" looks, so a cost far off still keeps an event from being ready. */
const SETTLED_MONTHS = 120;

/** Where an event stands: its stored state, and for an open one whether every cost is settled (paid, ended or a bill), which makes it ready to finish. Derived, never stored. */
export type HorizonStage = 'open' | 'readyToFinish' | 'finished' | 'calledOff';

const isCostSettled = (
  cost: HorizonCost,
  today: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[],
) => {
  if (cost.becameBillId !== null || cost.endsAfter !== null) return true;
  if (cost.schedule.anchor === null) return false;
  if (
    cost.schedule.kind !== 'once' &&
    cost.ending.onDate === null &&
    cost.ending.afterCount === null
  ) {
    return false;
  }
  return listCostPayments(
    cost,
    addUtcMonths(today, SETTLED_MONTHS),
    stance,
    paid,
  ).every((payment) => payment.paid !== null);
};

export function getHorizonStage(
  horizon: Pick<HorizonSealed, 'costs' | 'state'>,
  today: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
): HorizonStage {
  if (horizon.state !== 'open') return horizon.state;
  return horizon.costs.length > 0 &&
    horizon.costs.every((cost) => isCostSettled(cost, today, stance, paid))
    ? 'readyToFinish'
    : 'open';
}

/** The costs that still ask for money: not ended, not a bill, with a payment unpaid or none that ever ends. Finishing has none; calling an event off stops these. */
export const listOpenCosts = (
  horizon: Pick<HorizonSealed, 'costs'>,
  today: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
) =>
  horizon.costs.filter(
    (cost) =>
      cost.endsAfter === null &&
      cost.becameBillId === null &&
      !isCostSettled(cost, today, stance, paid),
  );

/** The bills an event's costs became; they stay when it is called off. */
export const listMadeBills = (horizon: Pick<HorizonSealed, 'costs'>) =>
  horizon.costs.filter((cost) => cost.becameBillId !== null);

/** The event in a new state from `on`, with where its money went; reopening clears both. */
export const setHorizonState = (
  horizon: HorizonSealed,
  state: HorizonState,
  on: DateOnly,
  money: HorizonMoneyLeft | null,
): HorizonSealed => ({
  ...horizon,
  state,
  stateOn: state === 'open' ? null : on,
  stateMoney: state === 'open' ? null : money,
});

/** What can come back into a reopened event: the money it sent away, less what the place it went to no longer has. Money kept held, or never moved, comes back by itself and asks nothing. */
export function getBringableCents(
  money: HorizonMoneyLeft | null,
  placeLeftCents: Cents,
): Cents {
  if (money === null || money.kind === 'held' || money.cents <= 0) return 0;
  return money.kind === 'free'
    ? money.cents
    : Math.min(money.cents, Math.max(0, placeLeftCents));
}
