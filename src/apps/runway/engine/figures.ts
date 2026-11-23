import type {
  DateOnly,
  HorizonVersion,
  Level,
  OpenAccount,
  OpenAccountBalance,
  OpenCard,
  OpenDay,
  OpenMove,
  OpenPlan,
  OpenPurchase,
  OpenRecord,
  OpenStartedPayment,
  OpenVersion,
  PlanItemDoc,
  BillVersion,
  Stance,
} from '@apps/runway/types';

import { getPaysItselfFrom, getUndoneDueDays, isAutoBill } from './autoPay';
import type { SelfPayingFacts } from './autoPay';
import { withBankBalances } from './accounts';
import { computeBillCover, type BillCover } from './billCover';
import { getFixedByBill } from './billShare';
import { getStretchesOf } from './billStretches';
import { getCashPosition, type CashPosition } from './cash';
import { getBankOwedByCard, type BankOwed } from './cards';
import {
  deriveBillProgress,
  withoutSpending,
  type ClosingState,
} from './closings';
import {
  buildComingDays,
  getOneTimePayLineIds,
  getPairedByBill,
  type ComingDay,
} from './comingDays';
import { addUtcMonths } from './dates';
import { planBillPayments, type BillPayment } from './demands';
import { deriveBalances, type Balances, type BalancesInput } from './balances';
import { findEmailTwins } from './emailTwins';
import { capEnding } from './endings';
import { LOOKAHEAD_MONTHS, PRIORITIES } from './engineConstants';
import type { CostPaidEntry } from './horizon';
import {
  getChangesOnlyDoneOn,
  getItemEnds,
  getItemStops,
} from './horizonLinks';
import { getLevel, isTrackingLevel } from './level';
import { isCountedAt } from './priorities';
import { NO_PROGRESS, type BillProgressInput } from './progress';
import { resolveCurrentOrNext } from './resolve';
import { readStance } from './stance';

/** The balances with the bills Free to Spend covers taken out of it and counted as held for bills. */
export interface CoveredBalances extends Balances {
  /** What the ledger alone holds for bills, before the cover. */
  ledgerBillsCents: number;
  billCover: BillCover;
}

export interface ResolvedBill {
  item: PlanItemDoc;
  version: BillVersion;
}

export interface ResolvedHorizon {
  item: PlanItemDoc;
  version: HorizonVersion;
}

export interface BankBacking {
  isBacked: boolean;
  hasTyped: boolean;
  cents: number;
}

/** On the lists on `on`: not archived and not ended before it. An older day still resolves what has since gone. */
export const isListed = (item: PlanItemDoc, on: number) =>
  (item.archivedAt === null || on < item.archivedAt) &&
  (item.endedAt === null || on <= item.endedAt);

const isBill = (version: OpenVersion): version is BillVersion =>
  version.kind === 'bill';

const isHorizon = (version: OpenVersion): version is HorizonVersion =>
  version.kind === 'horizon';

/** The bills in the plan on a date, in plan order: Must before Should before Want, then rank, then creation. */
export const resolveBills = (
  items: readonly PlanItemDoc[],
  versions: readonly OpenVersion[],
  on: number,
): ResolvedBill[] => {
  const billVersions = versions.filter(isBill);
  const result = items
    .filter((item) => item.kind === 'bill' && isListed(item, on))
    .flatMap((item) => {
      const version = resolveCurrentOrNext(billVersions, item.id, on);
      return version ? [{ item, version }] : [];
    })
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(a.version.payload.priority) -
          PRIORITIES.indexOf(b.version.payload.priority) ||
        a.version.payload.orderIndex - b.version.payload.orderIndex ||
        a.item.createdAt - b.item.createdAt ||
        a.item.id.localeCompare(b.item.id),
    );
  return result;
};

/** The ids of days that are confirmed or marked not arrived, as one string a selector can compare. */
export const getSettledKey = (days: readonly OpenDay[]) =>
  days
    .filter((day) => day.status !== 'draft')
    .map((day) => day.id)
    .sort()
    .join(',');

const toSet = (key: string) => new Set(key === '' ? [] : key.split(','));

/** The income days ahead, computed from schedules each time the plan changes and never stored. A day that is confirmed or marked not arrived is no longer coming. */
export const resolveComingDays = (
  items: readonly PlanItemDoc[],
  versions: readonly OpenVersion[],
  today: number,
  settledKey: string,
) => {
  const settled = toSet(settledKey);
  const result = buildComingDays(items, versions, today).filter(
    (day) => !settled.has(day.dayKey),
  );
  return result;
};

/** The records a starting amount does not already include: those of days whose money arrived on or after the starting day. */
export const getRecordsSinceStart = (
  records: readonly OpenRecord[],
  days: readonly OpenDay[],
  startDate: DateOnly | null,
) => {
  if (startDate === null) return records;
  const arrivedOn = new Map(
    days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
  );
  return records.filter(
    (record) => (arrivedOn.get(record.dayId) ?? 0) >= startDate,
  );
};

/** What confirmed days set aside for each item and which payments were marked paid, from the records and moves read. */
export const getBillProgress = (
  records: readonly OpenRecord[],
  days: readonly OpenDay[],
  moves: readonly OpenMove[],
  startDate: DateOnly | null,
  closing: ClosingState | null,
): Record<string, BillProgressInput> =>
  deriveBillProgress(
    records,
    new Map(days.map((day) => [day.id, day.expectedOn])),
    moves,
    startDate,
    closing,
  );

/** Every bill's payments with what has been set aside and what is paid, keyed by bill id. */
export const planAllBillPayments = (
  bills: readonly ResolvedBill[],
  comingDays: readonly ComingDay[],
  stance: Stance,
  progress: Record<string, BillProgressInput>,
  today: number,
  startDate: DateOnly | null,
  openDays: readonly OpenDay[],
  versions: readonly OpenVersion[],
): Record<string, BillPayment[]> => {
  const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const fixedByBill = getFixedByBill(openDays);
  const pairedByBill = getPairedByBill(versions, openDays, comingDays, stance);
  const oneTimePayLineIds = getOneTimePayLineIds(versions);
  const result = Object.fromEntries(
    bills.map(({ item, version }) => {
      const { payload } = version;
      return [
        item.id,
        planBillPayments(
          {
            itemId: item.id,
            createdAt: item.createdAt,
            priority: payload.priority,
            orderIndex: payload.orderIndex,
            amount: payload.amount,
            stanceOverride: payload.stanceOverride ?? null,
            schedule: payload.timing.schedule,
            ending: capEnding(payload.ending, item.endedAt),
            fundedBy: payload.fundedBy,
            payOnDay: payload.payOnDay ?? null,
            stretches: getStretchesOf(versions, item),
            fixed: fixedByBill.get(item.id),
            paired: pairedByBill.get(item.id),
            oneTimePayLineIds,
            progress: progress[item.id] ?? NO_PROGRESS,
          },
          comingDays,
          horizon,
          stance,
          { today, startDate },
        ),
      ];
    }),
  );
  return result;
};

/** Every Horizon item listed on a date, open or done, soonest next cost first, then the event's own date. */
const getNextCostOn = (version: HorizonVersion, on: number) =>
  Math.min(
    Number.MAX_SAFE_INTEGER,
    ...version.payload.costs.flatMap(({ schedule, endsAfter }) =>
      schedule.anchor !== null &&
      schedule.anchor >= on &&
      (endsAfter === null || schedule.anchor <= endsAfter)
        ? [schedule.anchor]
        : [],
    ),
  );

export const resolveAllHorizonItems = (
  items: readonly PlanItemDoc[],
  versions: readonly OpenVersion[],
  on: number,
): ResolvedHorizon[] => {
  const horizonVersions = versions.filter(isHorizon);
  const result = items
    .filter((item) => item.kind === 'horizon' && isListed(item, on))
    .flatMap((item) => {
      const version = resolveCurrentOrNext(horizonVersions, item.id, on);
      return version ? [{ item, version }] : [];
    })
    .sort(
      (a, b) =>
        getNextCostOn(a.version, on) - getNextCostOn(b.version, on) ||
        a.version.payload.happensOn - b.version.payload.happensOn ||
        a.item.createdAt - b.item.createdAt ||
        a.item.id.localeCompare(b.item.id),
    );
  return result;
};

/** The Horizon items still in the plan on a date: the ones that are not finished or called off, and not an event of changes alone whose changes have all happened. */
export const resolveHorizonItems = (
  all: readonly ResolvedHorizon[],
  versions: readonly OpenVersion[],
  on: number,
  stops: ReturnType<typeof getItemStops>,
  ends: ReturnType<typeof getItemEnds>,
): ResolvedHorizon[] =>
  all.filter(
    ({ version }) =>
      version.payload.state === 'open' &&
      getChangesOnlyDoneOn(version.payload, versions, on, stops, ends) === null,
  );

/** Each Horizon item's payments marked paid and not undone, by item id. */
export const getCostPaid = (
  progress: Record<string, BillProgressInput>,
): Record<string, CostPaidEntry[]> =>
  Object.fromEntries(
    Object.entries(progress).flatMap(([id, entry]) =>
      entry.costPaid ? [[id, entry.costPaid]] : [],
    ),
  );

/** The day each bill's "pays itself" setting was turned on, by bill id. */
export const getPaysItselfFromByBill = (versions: readonly OpenVersion[]) => {
  const billVersions = versions.flatMap((version) =>
    version.kind === 'bill' ? [version] : [],
  );
  const ids = [...new Set(billVersions.map((version) => version.itemId))];
  return Object.fromEntries(
    ids.map((id) => [
      id,
      getPaysItselfFrom(
        billVersions.filter((version) => version.itemId === id),
      ),
    ]),
  );
};

/** The bills that pay themselves (from Track up), with what `isSelfPaying` reads. */
export const getSelfPayingBills = (
  bills: readonly ResolvedBill[],
  level: Level,
  moves: readonly OpenMove[],
  paysItselfFrom: Record<string, number | null>,
  startDate: DateOnly | null,
): Record<string, SelfPayingFacts & { paysItself: true }> => {
  const undone = getUndoneDueDays(moves);
  return Object.fromEntries(
    bills
      .filter(({ version }) => isAutoBill(version.payload, level))
      .map(({ item }) => [
        item.id,
        {
          paysItself: true as const,
          undoneDueOn: undone[item.id] ?? [],
          paysItselfFrom: Math.max(
            paysItselfFrom[item.id] ?? 0,
            startDate ?? 0,
          ),
          isAtLink: level === 'link',
        },
      ]),
  );
};

/** The window and Needs a home together, each purchase once. */
export const mergePurchases = (
  needsHome: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
): OpenPurchase[] => [
  ...new Map(
    [...needsHome, ...purchases].map((purchase) => [purchase.id, purchase]),
  ).values(),
];

/** The ids of emailed purchases whose bank charge is here, or could be one of several here: the charge counts, so Free to Spend and a card's balance leave them out rather than count one purchase twice. */
export const toTwinnedEmailIds = (
  twins: ReturnType<typeof findEmailTwins>,
): ReadonlySet<string> => new Set([...twins.clear.keys(), ...twins.ambiguous]);

/** At Link, each linked card with a balance from its bank, read from the bank (`getBankOwedByCard`); empty at every other level, where a card's figure is what Runway counted. */
export const getBankOwed = (
  level: Level,
  cards: readonly OpenCard[],
  accountBalances: readonly OpenAccountBalance[],
  purchases: readonly OpenPurchase[],
  needsHome: readonly OpenPurchase[],
  started: readonly OpenStartedPayment[],
  twinnedEmailIds: ReadonlySet<string>,
  today: DateOnly,
): Record<string, BankOwed> => {
  if (level !== 'link') return {};
  const bankById = new Map(accountBalances.map((entry) => [entry.id, entry]));
  const linked = cards.flatMap((card) => {
    const bank = card.linkId === null ? undefined : bankById.get(card.id);
    return bank === undefined ? [] : [{ id: card.id, postedCents: bank.cents }];
  });
  if (linked.length === 0) return {};
  return getBankOwedByCard({
    cards: linked,
    purchases: mergePurchases(needsHome, purchases),
    started,
    today,
    twinnedEmailIds,
  });
};

/** What each linked card holds back from Free to Spend at Link, by card id. */
export const getBankHeldByCard = (
  owed: Record<string, BankOwed>,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(owed).map(([id, entry]) => [id, entry.heldCents]),
  );

/** What the ledger sums from, before a level's reading: the same lists the selectors hold. */
export const toBalanceInputs =
  (level: Level) =>
  (
    startDate: DateOnly | null,
    moves: readonly OpenMove[],
    records: readonly OpenRecord[],
    days: readonly OpenDay[],
    items: readonly PlanItemDoc[],
    purchases: readonly OpenPurchase[],
    cards: readonly OpenCard[],
    closing: ClosingState | null,
    today: DateOnly,
  ): BalancesInput => ({
    startDate,
    moves,
    records,
    arrivedOn: new Map(
      days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
    ),
    expectedOn: new Map(days.map((day) => [day.id, day.expectedOn])),
    purchases: isTrackingLevel(level) ? purchases : [],
    closing:
      closing !== null && !isTrackingLevel(level)
        ? withoutSpending(closing)
        : closing,
    isCountingCards: isTrackingLevel(level),
    releasedFrom: Object.fromEntries(
      items.flatMap((item) =>
        item.heldReleasedOn === null ? [] : [[item.id, item.heldReleasedOn]],
      ),
    ),
    asOf: today,
    kinds: Object.fromEntries([
      ...items.flatMap((item) =>
        item.kind === 'goal' ||
        item.kind === 'bill' ||
        item.kind === 'envelope' ||
        item.kind === 'horizon'
          ? [[item.id, item.kind] as const]
          : [],
      ),
      ...cards.map((card) => [card.id, 'card'] as const),
    ]),
  });

/** What the ledger sums from, at the level the plan is at, before any match to the account balances; at Link a linked card takes its bank's figure. */
export const toLedgerBalanceInputs = (
  startDate: DateOnly | null,
  moves: readonly OpenMove[],
  records: readonly OpenRecord[],
  days: readonly OpenDay[],
  items: readonly PlanItemDoc[],
  purchases: readonly OpenPurchase[],
  cards: readonly OpenCard[],
  closing: ClosingState | null,
  today: DateOnly,
  level: Level,
  bankOwedByCard: Record<string, number>,
): BalancesInput => ({
  ...toBalanceInputs(level)(
    startDate,
    moves,
    records,
    days,
    items,
    purchases,
    cards,
    closing,
    today,
  ),
  bankOwedByCard,
});

/** Where the cash in the accounts that count goes, at Link. */
export const readCashPosition = (
  balances: Balances,
  accounts: readonly OpenAccount[],
  accountBalances: readonly OpenAccountBalance[],
  items: readonly PlanItemDoc[],
  needsHome: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
  twinnedEmailIds: ReadonlySet<string>,
  today: DateOnly,
): CashPosition =>
  getCashPosition({
    twinnedEmailIds,
    accounts: [...accounts].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    ),
    bankBalances: Object.fromEntries(
      accountBalances.map((entry) => [entry.id, entry.cents]),
    ),
    balances,
    goalIds: items
      .filter(
        (item) =>
          item.kind === 'goal' &&
          !(item.heldReleasedOn !== null && item.heldReleasedOn <= today),
      )
      .map((item) => item.id),
    envelopeIds: items
      .filter((item) => item.kind === 'envelope')
      .map((item) => item.id),
    purchases: mergePurchases(needsHome, purchases),
  });

/** At Link, whether Free to Spend comes from the account balances, and what they hold beyond (or short of) what the ledger counts. Typed balances stand in for accounts with no link; nothing changes while an account that counts has no balance at all. */
export const getBankBacking = (
  level: Level,
  ledger: Balances,
  position: CashPosition,
): BankBacking => {
  const isBacked =
    level === 'link' &&
    ledger.hasMoney &&
    position.cashCents !== null &&
    position.accounts.some((account) => account.isBank);
  return {
    isBacked,
    hasTyped: position.accounts.some((account) => !account.isBank),
    cents: isBacked
      ? (position.freeCents ?? 0) -
        position.overAssignedCents -
        ledger.freeToSpendCents
      : 0,
  };
};

/** What the balances are summed from once matched to the account balances at Link. */
export const toBankedBalanceInputs = (
  inputs: BalancesInput,
  backing: BankBacking,
): BalancesInput => ({ ...inputs, bankAdjustCents: backing.cents });

/** What Free to Spend sets aside for bills its pays won't carry in time. */
export const getBillCover = (
  balances: Balances,
  bills: readonly ResolvedBill[],
  payments: Record<string, BillPayment[]>,
  comingDays: readonly ComingDay[],
  today: DateOnly,
): BillCover =>
  computeBillCover({
    today,
    bills: bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      isDated: version.payload.timing.schedule.anchor !== null,
    })),
    payments,
    nextPayOn: comingDays.find((day) => day.on >= today)?.on ?? null,
    freeToSpendCents:
      balances.isStarted && balances.hasMoney ? balances.freeToSpendCents : 0,
  });

/** Every balance summed from the ledger and never stored, with the bills Free to Spend covers held for them. */
export const coverBalances = (
  balances: Balances,
  billCover: BillCover,
): CoveredBalances => ({
  ...balances,
  ledgerBillsCents: balances.assignedToBillsCents,
  assignedToBillsCents: balances.assignedToBillsCents + billCover.coveredCents,
  freeToSpendCents: balances.freeToSpendCents - billCover.coveredCents,
  billCover,
});

/** What the bills still unpaid at or above `dial` ask before the next pay arrives, a bill due on the pay day itself left to that pay; null when no pay is coming; `payOn` is that pay's day. */
export const getBillsDueBeforePay = (
  payments: Record<string, BillPayment[]>,
  comingDays: readonly ComingDay[],
  bills: readonly ResolvedBill[],
  dial: Parameters<typeof isCountedAt>[1],
): { cents: number; payOn: number } | null => {
  const nextPay = comingDays[0];
  if (!nextPay) return null;
  const cents = bills
    .filter(({ version }) => isCountedAt(version.payload.priority, dial))
    .flatMap(({ item }) => payments[item.id] ?? [])
    .filter(({ paid, payOn }) => paid === null && payOn < nextPay.on)
    .reduce((sum, { totalCents }) => sum + totalCents, 0);
  return { cents, payOn: nextPay.on };
};

/** The opened documents the figures are worked out from: the plan, its lists, and the window's ledger. */
export interface FiguresInput {
  today: DateOnly;
  /** The zone the day boundaries are read in; null reads the device's. */
  zone: string | null;
  plan: Pick<OpenPlan, 'startDate' | 'trackingPeriods' | 'stance'>;
  items: readonly PlanItemDoc[];
  versions: readonly OpenVersion[];
  days: readonly OpenDay[];
  moves: readonly OpenMove[];
  records: readonly OpenRecord[];
  purchases: readonly OpenPurchase[];
  needsHome: readonly OpenPurchase[];
  cards: readonly OpenCard[];
  /** The accounts as stored; a linked one takes its bank's figure here. */
  accounts: readonly OpenAccount[];
  accountBalances: readonly OpenAccountBalance[];
  startedPayments: readonly OpenStartedPayment[];
  closing: ClosingState | null;
}

/** The lists a figure is worked out from, where the phone already holds them as opened documents. */
export const toFiguresInput = (
  input: Omit<FiguresInput, 'accounts'> & {
    savedAccounts: readonly OpenAccount[];
  },
): FiguresInput => {
  const { savedAccounts, ...rest } = input;
  return {
    ...rest,
    accounts: withBankBalances(
      savedAccounts,
      input.accountBalances,
      input.zone,
    ),
  };
};

export interface Figures {
  level: Level;
  balances: CoveredBalances;
  billCover: BillCover;
  bankBacking: BankBacking;
  nextPayOn: DateOnly | null;
  dueBeforePay: { cents: number; payOn: number } | null;
  /** What the share summary reads besides the headline figures. */
  detail: {
    stance: Stance;
    bills: ResolvedBill[];
    payments: Record<string, BillPayment[]>;
    comingDays: ComingDay[];
    progress: Record<string, BillProgressInput>;
    horizon: ResolvedHorizon[];
    costPaid: Record<string, CostPaidEntry[]>;
    selfPaying: ReturnType<typeof getSelfPayingBills>;
  };
}

/** What a stored snapshot seals: the headline figures, without the detail the share summary reads. */
export interface FiguresSnapshotSealed {
  timeZone: string | null;
  level: Level;
  balances: CoveredBalances;
  billCover: BillCover;
  bankBacking: BankBacking;
  nextPayOn: DateOnly | null;
  dueBeforePay: { cents: number; payOn: number } | null;
}

/** Every figure the plan's screens read, worked out from the opened documents alone, in the same order and with the same functions the app's selectors chain. */
export function computeFigures(input: FiguresInput): Figures {
  const { today, plan } = input;
  const startDate = plan.startDate ?? null;
  const level = getLevel(plan.trackingPeriods);
  const stance = readStance(plan.stance);
  const allPurchases = mergePurchases(input.needsHome, input.purchases);
  const twinned = toTwinnedEmailIds(findEmailTwins(allPurchases));
  const bankOwed = getBankOwed(
    level,
    input.cards,
    input.accountBalances,
    input.purchases,
    input.needsHome,
    input.startedPayments,
    twinned,
    today,
  );
  const ledgerInputs = toLedgerBalanceInputs(
    startDate,
    input.moves,
    input.records,
    input.days,
    input.items,
    input.purchases,
    input.cards,
    input.closing,
    today,
    level,
    getBankHeldByCard(bankOwed),
  );
  const ledger = deriveBalances(ledgerInputs);
  const position = readCashPosition(
    ledger,
    input.accounts,
    input.accountBalances,
    input.items,
    input.needsHome,
    input.purchases,
    twinned,
    today,
  );
  const bankBacking = getBankBacking(level, ledger, position);
  const ledgerOnly = deriveBalances(
    toBankedBalanceInputs(ledgerInputs, bankBacking),
  );
  const bills = resolveBills(input.items, input.versions, today);
  const comingDays = resolveComingDays(
    input.items,
    input.versions,
    today,
    getSettledKey(input.days),
  );
  const recordsSinceStart = getRecordsSinceStart(
    input.records,
    input.days,
    startDate,
  );
  const progress = getBillProgress(
    recordsSinceStart,
    input.days,
    input.moves,
    startDate,
    input.closing,
  );
  const payments = planAllBillPayments(
    bills,
    comingDays,
    stance,
    progress,
    today,
    startDate,
    input.days,
    input.versions,
  );
  const billCover = getBillCover(
    ledgerOnly,
    bills,
    payments,
    comingDays,
    today,
  );
  const all = resolveAllHorizonItems(input.items, input.versions, today);
  return {
    level,
    balances: coverBalances(ledgerOnly, billCover),
    billCover,
    bankBacking,
    nextPayOn: comingDays.find((day) => day.on >= today)?.on ?? null,
    dueBeforePay: getBillsDueBeforePay(payments, comingDays, bills, 'want'),
    detail: {
      stance,
      bills,
      payments,
      comingDays,
      progress,
      horizon: resolveHorizonItems(
        all,
        input.versions,
        today,
        getItemStops(input.items),
        getItemEnds(input.items),
      ),
      costPaid: getCostPaid(progress),
      selfPaying: getSelfPayingBills(
        bills,
        level,
        input.moves,
        getPaysItselfFromByBill(input.versions),
        startDate,
      ),
    },
  };
}
