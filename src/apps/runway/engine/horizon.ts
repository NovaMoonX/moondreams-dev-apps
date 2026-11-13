import type {
  Cents,
  CostPaidMark,
  DateOnly,
  HorizonCost,
  HorizonMoneyLeft,
  HorizonRest,
  HorizonSealed,
  HorizonState,
  HorizonStored,
  MoneyRange,
  OpenMove,
  PlanItemDoc,
  Priority,
  Schedule,
  Stance,
} from '@apps/runway/types';

import { generateUuid } from '@/utils/idUtils';

import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';

import { addUtcMonths, DAY_MS } from './dates';
import { getGoalBalanceAt, getGoalCostId, type GoalCover } from './horizonGoal';
import { getIntervalMonths, occurrences } from './schedule';
import { pick } from './stance';

const MONTH_MS = (365.25 / 12) * DAY_MS;

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
  /** The part paid out of the event's linked goal; zero when none was. */
  fromGoalCents: Cents;
  goalId: string | null;
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

/** Where a payment takes its money when the event has a linked goal: the goal's balance first, then the event's own, and Free to Spend for the rest. A mark that moves nothing takes none. */
export function settleCostPaidWithGoal(
  amountCents: Cents,
  goalHeldCents: Cents,
  heldCents: Cents,
  mark: CostPaidMark = 'item',
) {
  const fromGoalCents =
    mark === 'item' ? Math.min(amountCents, Math.max(0, goalHeldCents)) : 0;
  return {
    fromGoalCents,
    ...settleCostPaid(amountCents - fromGoalCents, heldCents, mark),
  };
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

/** The priority a cost is counted at: its own, else its item's. */
export const getCostPriority = (
  cost: Pick<HorizonCost, 'priority'>,
  itemPriority: Priority,
): Priority => cost.priority ?? itemPriority;

/** How far a plan's uncovered payments fall short, counting only the costs in `countedIds`; none when the rest is not decided later. */
export const sumCountedShortCents = (
  plan: Pick<HorizonPlan, 'covers' | 'shortfall'>,
  countedIds: ReadonlySet<string>,
): Cents =>
  plan.shortfall === null
    ? 0
    : plan.covers
        .filter(({ costId }) => countedIds.has(costId))
        .reduce(
          (sum, { coveredCents, totalCents }) =>
            sum + totalCents - coveredCents,
          0,
        );

/** The steady amount a month that meets every uncovered payment of the costs in `countedIds` on its due date, the pace a dated goal is held to; a payment already due asks all of itself now. */
export const getHorizonPaceCents = (
  covers: readonly HorizonCover[],
  countedIds: ReadonlySet<string>,
  today: DateOnly,
  startsOn: DateOnly | null = null,
): Cents =>
  covers
    .filter(({ costId }) => countedIds.has(costId))
    .reduce<{ shortCents: Cents; paceCents: Cents }>(
      (walk, { dueOn, coveredCents, totalCents }) => {
        const shortCents = walk.shortCents + totalCents - coveredCents;
        const months = Math.max(
          1,
          (dueOn - Math.max(today, startsOn ?? today)) / MONTH_MS,
        );
        return {
          shortCents,
          paceCents: Math.max(walk.paceCents, Math.ceil(shortCents / months)),
        };
      },
      { shortCents: 0, paceCents: 0 },
    ).paceCents;

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

const readRest = (rest: HorizonStored['rest']): HorizonRest =>
  !rest
    ? { kind: 'later' }
    : rest.kind === 'pays'
      ? { kind: 'pays', startsOn: 'startsOn' in rest ? rest.startsOn : null }
      : rest;

/** A stored payload with the fields later issues added filled in, so a version sealed before them reads as it always meant. */
export const readHorizon = (stored: HorizonStored): HorizonSealed => ({
  ...stored,
  rest: readRest(stored.rest),
  costs: stored.costs.map((cost) => ({
    ...cost,
    isOutside: cost.isOutside ?? false,
    ending: cost.ending ?? { onDate: null, afterCount: null },
    pricedOn: cost.pricedOn ?? null,
    endsAfter: cost.endsAfter ?? null,
    becameBillId: cost.becameBillId ?? null,
    becameBillOn: cost.becameBillOn ?? null,
    priority: cost.priority ?? null,
  })),
  state: stored.state ?? 'open',
  stateOn: stored.stateOn ?? null,
  stateMoney: stored.stateMoney ?? null,
  links: stored.links ?? [],
  goalId: stored.goalId ?? null,
  isYearly: stored.isYearly ?? false,
  fromId: stored.fromId ?? null,
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
  'name' | 'schedule' | 'ending' | 'isOutside' | 'priority'
>;

/** The item with one cost's name, schedule, ending, paid-outside answer and priority replaced; null when the cost is no longer in it. */
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
                priority: fields.priority,
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
  /** Everything that covers the payment: the linked goal's part and the event's own. */
  coveredCents: Cents;
  totalCents: Cents;
  /** The part of `coveredCents` the linked goal covers; only present when the event has one. */
  fromGoalCents?: Cents;
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

/** Walks the money over the unpaid payments in due order, ties by cost id with the linked goal's own cost first; the input order changes nothing. With a linked goal, each payment is covered first from what the goal is projected to hold on its due date (less what earlier payments took of it), then from the event's own money. */
export function planHorizon(
  item: Pick<HorizonSealed, 'rest'> & { costs: readonly HorizonCost[] },
  heldCents: Cents,
  payments: readonly CostPayment[],
  goal: GoalCover | null = null,
): HorizonPlan {
  const outsideIds = new Set(
    item.costs.filter(({ isOutside }) => isOutside).map(({ id }) => id),
  );
  const isGoalCost = (costId: string) =>
    goal !== null && costId === getGoalCostId(goal.goalId);
  const ordered = payments
    .filter(({ costId, paid }) => paid === null && !outsideIds.has(costId))
    .sort(
      (a, b) =>
        a.dueOn - b.dueOn ||
        Number(isGoalCost(b.costId)) - Number(isGoalCost(a.costId)) ||
        a.costId.localeCompare(b.costId),
    );
  const covers = ordered.reduce<{
    left: Cents;
    goalUsed: Cents;
    list: HorizonCover[];
  }>(
    (walk, { costId, dueOn, totalCents }) => {
      const fromGoalCents = goal
        ? Math.min(
            totalCents,
            Math.max(0, getGoalBalanceAt(goal, dueOn) - walk.goalUsed),
          )
        : 0;
      const ownCents = Math.min(totalCents - fromGoalCents, walk.left);
      return {
        left: walk.left - ownCents,
        goalUsed: walk.goalUsed + fromGoalCents,
        list: [
          ...walk.list,
          {
            costId,
            dueOn,
            coveredCents: fromGoalCents + ownCents,
            totalCents,
            ...(goal ? { fromGoalCents } : {}),
          },
        ],
      };
    },
    { left: Math.max(0, heldCents), goalUsed: 0, list: [] },
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
  fromGoalCents: Cents = 0,
) => ({
  setAsideCents: leftCents + spentCents - fromFreeCents - fromGoalCents,
  spentCents,
  fromFreeCents,
  leftCents,
});

/** How far ahead "every payment is settled" looks, so a cost far off still keeps an event from being ready. */
const SETTLED_MONTHS = 120;

/** The soonest payment from today on still unpaid across every cost, inside the plan or not and however far off, or null when none is. */
export const getNextUnpaidPayment = (
  costs: readonly HorizonCost[],
  today: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
): CostPayment | null =>
  listHorizonPayments(
    costs,
    addUtcMonths(today, SETTLED_MONTHS),
    stance,
    paid,
  ).find((payment) => payment.paid === null && payment.dueOn >= today) ?? null;

/** Where an event stands: its stored state, and for an open one whether every cost is settled (paid, ended or a bill), which makes it ready to finish. Derived, never stored. */
export type HorizonStage = 'open' | 'readyToFinish' | 'finished' | 'calledOff';

const isCostSettled = (
  cost: HorizonCost,
  today: DateOnly,
  stance: Stance,
  paid: readonly CostPaidEntry[],
) => {
  if (cost.becameBillId !== null || cost.endsAfter !== null) return true;
  const { anchor } = cost.schedule;
  if (anchor === null) return false;
  const limit = addUtcMonths(today, SETTLED_MONTHS);
  const { ending, schedule } = cost;
  const isEndReached =
    schedule.kind === 'once'
      ? anchor <= limit
      : (ending.onDate !== null && ending.onDate <= limit) ||
        (ending.afterCount !== null &&
          occurrences(schedule, ending, 0, limit).length >= ending.afterCount);
  if (!isEndReached) return false;
  return listCostPayments(cost, limit, stance, paid).every(
    (payment) => payment.paid !== null,
  );
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

/** What can come back into a reopened event: the money it sent away, less what the place it went to (or Free to Spend) no longer has. Money kept held, or never moved, comes back by itself and asks nothing. */
export function getBringableCents(
  money: HorizonMoneyLeft | null,
  availableCents: Cents,
): Cents {
  if (money === null || money.kind === 'held' || money.cents <= 0) return 0;
  return Math.min(money.cents, Math.max(0, availableCents));
}

/** The costs that repeat with no end, which keep an event from being ready to finish until they are ended or made a bill. */
export const listEndlessCosts = (horizon: Pick<HorizonSealed, 'costs'>) =>
  horizon.costs.filter(
    (cost) =>
      cost.becameBillId === null &&
      cost.endsAfter === null &&
      cost.schedule.kind !== 'once' &&
      cost.ending.onDate === null &&
      cost.ending.afterCount === null,
  );

/** The id of the version written over `baseVersionId`: the same for every write made from that base, so a second one is refused, and it stays as short as the base's root. `stretch` names the later stretches of one write. */
export const getNextVersionId = (baseVersionId: string, stretch = 0) => {
  const match = /^(.*)~(\d+)(?:_\d+)?$/.exec(baseVersionId);
  const root = match ? match[1] : baseVersionId;
  const generation = match ? Number(match[2]) + 1 : 1;
  return `${root}~${generation}${stretch === 0 ? '' : `_${stretch}`}`;
};

/** The open event lined up from `itemId`, and whether it is still as it was made: one version and no move but the one that carried money in. Null when none was lined up. */
export function findNextYearOf(
  itemId: string,
  carryMoveId: string | null,
  items: readonly Pick<PlanItemDoc, 'id' | 'archivedAt' | 'endedAt'>[],
  versions: readonly {
    itemId: string;
    id: string;
    kind: string;
    payload: unknown;
  }[],
  moves: readonly OpenMove[],
): {
  itemId: string;
  versionId: string;
  happensOn: DateOnly;
  isUntouched: boolean;
} | null {
  const made = versions.find(
    (version) =>
      version.kind === 'horizon' &&
      (version.payload as HorizonSealed).fromId === itemId &&
      items.some(
        (item) =>
          item.id === version.itemId &&
          item.archivedAt === null &&
          item.endedAt === null,
      ),
  );
  if (!made) return null;
  const own = versions.filter((version) => version.itemId === made.itemId);
  const isMoved = moves.some(
    (move) =>
      move.id !== carryMoveId &&
      (move.refId === made.itemId ||
        (move.kind === 'transfer' &&
          (move.payload.fromId === made.itemId ||
            move.payload.toId === made.itemId))),
  );
  return {
    itemId: made.itemId,
    versionId: made.id,
    happensOn: (made.payload as HorizonSealed).happensOn,
    isUntouched: own.length === 1 && !isMoved,
  };
}

const nextYear = (date: DateOnly) => addUtcMonths(date, 12);

const getNextYearRest = (rest: HorizonRest): HorizonRest => {
  if (rest.kind === 'onePay') return { kind: 'pays', startsOn: null };
  return rest.kind === 'pays'
    ? {
        kind: 'pays',
        startsOn: rest.startsOn === null ? null : nextYear(rest.startsOn),
      }
    : rest;
};

/** The same event a year on, open and empty of history: costs that became bills or were removed are left out, and a one-time cost that was paid plans exactly what it came to. */
export function getNextYearHorizon(
  horizon: HorizonSealed,
  paid: readonly CostPaidEntry[],
  thisId: string,
): HorizonSealed {
  return {
    ...horizon,
    happensOn: nextYear(horizon.happensOn),
    happensUntil:
      horizon.happensUntil === null ? null : nextYear(horizon.happensUntil),
    rest: getNextYearRest(horizon.rest),
    costs: horizon.costs
      .filter((cost) => cost.becameBillId === null && cost.endsAfter === null)
      .map((cost) => {
        const cameTo = paid
          .filter((entry) => entry.costId === cost.id)
          .reduce((sum, entry) => sum + entry.amountCents, 0);
        const isSettled = cost.schedule.kind === 'once' && cameTo > 0;
        return {
          ...cost,
          id: generateUuid(),
          amount: isSettled
            ? { lowCents: cameTo, highCents: cameTo }
            : cost.amount,
          schedule: {
            ...cost.schedule,
            anchor:
              cost.schedule.anchor === null
                ? null
                : nextYear(cost.schedule.anchor),
          },
          ending: {
            ...cost.ending,
            onDate:
              cost.ending.onDate === null ? null : nextYear(cost.ending.onDate),
          },
          pricedOn: null,
          endsAfter: null,
          becameBillId: null,
          becameBillOn: null,
        };
      }),
    state: 'open',
    stateOn: null,
    stateMoney: null,
    links: [],
    isYearly: true,
    fromId: thisId,
  };
}
