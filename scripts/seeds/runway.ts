import { readFileSync } from 'node:fs';

import {
  DEV_KEYRING,
  deriveSeedDataKey,
  keyCheckPath,
  makeKeyCheck,
  readKeyring,
  wrapDataKey,
} from '../../functions/src/apps/runway/planKey.ts';
import { formatDateOrdinalUTC } from '../../src/utils/formatUtils.ts';
import {
  AUTO_PAY_WORDS,
  CARD_FEE_WORDS,
  DEFAULT_CURRENCY_CODE,
  PAID_HISTORY_WORDS,
  HORIZON_END_WORDS,
  LINK_BANKS_GATE_ID,
} from '../../src/apps/runway/constants.ts';
import { formatCents } from '../../src/utils/moneyUtils.ts';
import {
  DAY_MS,
  startOfUtcDay,
  toDayKey,
  toDayStamp,
} from '../../src/apps/runway/engine/dates.ts';
import {
  applyLineEdits,
  getLineDifferences,
  getRemainder,
} from '../../src/apps/runway/engine/differences.ts';
import {
  buildCorrection,
  getCorrectionId,
} from '../../src/apps/runway/engine/correct.ts';
import {
  buildClosings,
  encodeClosing,
  getLastClosableMonth,
  getMonthStart,
  getNextMonth,
  listMonths,
  toMonthKey,
} from '../../src/apps/runway/engine/closings.ts';
import {
  getCostPaidMoveId,
  getPaidMoveId,
} from '../../src/apps/runway/engine/progress.ts';
import {
  describeCostMadeBill,
  describeCostPaid,
  describeCostTakenBack,
} from '../../src/apps/runway/utils/changeText.ts';
import {
  getMadeBillId,
  setCostBill,
  settleCostPaid,
} from '../../src/apps/runway/engine/horizon.ts';
import { getCostLineId } from '../../src/apps/runway/engine/parts.ts';
import { openMonthEntries } from '../../src/apps/runway/store/listeners/openLedger.ts';
import { sealJson } from '../../src/apps/runway/security.ts';
import {
  CARD_FEE_GROUP_ID,
  buildFeeBill,
} from '../../src/apps/runway/engine/cardFees.ts';
import type {
  AccountBalanceDoc,
  CardStatementDoc,
  CardStatementSealed,
  AccountDoc,
  AccountSealed,
  LinkDoc,
  LinkSealed,
  CardDoc,
  CardPaymentSealed,
  TransferSealed,
  CardSealed,
  ExpenseDoc,
  RuleDoc,
  RuleSealed,
  ExpenseSealed,
  ChangeDoc,
  ChangeSealed,
  ClosingDoc,
  BillPaidSealed,
  CostPaidSealed,
  BillSealed,
  ConfirmedSealed,
  DayOverrideSealed,
  ProposedSealed,
  RecordLine,
  EnvelopeSealed,
  GoalSealed,
  GroupSealed,
  HorizonCost,
  HorizonSealed,
  IncomeDayDoc,
  MoveDoc,
  PayLineSealed,
  PurchaseDoc,
  PurchaseLine,
  PurchaseSealed,
  CostRef,
  SourceSealed,
  StartHolding,
  StartSealed,
} from '../../src/apps/runway/types.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

/** Plain placeholder marks standing in for the logos the bank sends. */
const SEED_LOGO_RED =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAuUlEQVR42u2aQQ6AIAwEeYkP8f3+S68eEChQ2K3bpPE6k8WorSmpAtV1nHfLlRIaUiYHVevtMj3QFqll8LPbXcITvnS8aODdEtkBP01iJ/xbgha+WwINvlsCpc0SSPBmCaTjY74XkOFNEsjwRQnqBFjgqxLo/SnBkEDTMVICSkAJKAE9zMI+zGK/C4VIQF9kKNMJRAmNVujgESSoZ6PU02nX/cDKJYfWTCskoLaVI6tWLbt//buBaqAe54d74r6pqBcAAAAASUVORK5CYII=';
const SEED_LOGO_PURPLE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAuUlEQVR42u2aQQ6AIAwE+ZkP8d9+R68eEChQ2K3bpPE6k8WorSmpAtV5XHfLlRIaUiYHVevtMj3QFqll8LPbXcITvnS8aODdEtkBP01iJ/xbgha+WwINvlsCpc0SSPBmCaTjY74XkOFNEsjwRQnqBFjgqxLo/SnBkEDTMVICSkAJKAE9zMI+zGK/C4VIQF9kKNMJRAmNVujgESSoZ6PU02nX/cDKJYfWTCskoLaVI6tWLbt//buBaqAeNE1GEElmoxYAAAAASUVORK5CYII=';

const SECRET_FILE = new URL('../../functions/.secret.local', import.meta.url);

/** The emulator's keyring: `RUNWAY_MASTER_KEYS` in functions/.secret.local, else the built-in development one. */
export function readEmulatorKeyring() {
  try {
    const line = readFileSync(SECRET_FILE, 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith('RUNWAY_MASTER_KEYS='));
    const raw = line
      ?.slice('RUNWAY_MASTER_KEYS='.length)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    return raw ? readKeyring(raw) : DEV_KEYRING;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return DEV_KEYRING;
    throw error;
  }
}

export const header = (
  id: string,
  kind: string,
  parentId: string | null,
  createdAt: number,
) => ({
  id,
  kind,
  parentId,
  createdAt,
  endedAt: null,
  archivedAt: null,
  heldReleasedOn: null,
});
export const version = (
  id: string,
  itemId: string,
  kind: string,
  createdAt: number,
  effectiveFrom: number,
  changeId: string,
  sealed: unknown,
) => ({
  id,
  itemId,
  kind,
  createdAt,
  effectiveFrom,
  effectiveUntil: null,
  changeId,
  sealed,
});
export const change = (
  id: string,
  createdAt: number,
  effectiveFrom: number,
  itemIds: string[],
  sealed: unknown,
) => ({
  id,
  kind: 'planChange',
  createdAt,
  effectiveFrom,
  itemIds,
  sealed,
});

/** Alex has a plan that opens like a real one; every other account has none, so its first open creates one. */
export async function seedRunway(context: SeedContext): Promise<SeedResult> {
  const keyring = readEmulatorKeyring();
  const owner = FIXTURE_USERS.partnerOne;
  const data = deriveSeedDataKey(keyring, owner.uid);
  const createdAt = context.now - 14 * DAY_MS;

  const encryption = {
    appId: 'runway' as const,
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const sealed = await sealJson(
    { currencyCode: DEFAULT_CURRENCY_CODE },
    encryption,
  );

  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`apps/runway/server/${owner.uid}/keys/data`),
    wrapDataKey(keyring, owner.uid, data, createdAt),
  );
  batch.set(context.firestore.doc(`apps/runway/plans/${owner.uid}`), {
    uid: owner.uid,
    createdAt,
    updatedAt: createdAt,
    stance: 'conservative',
    startDate: startOfUtcDay(context.now) - 45 * DAY_MS,
    trackingPeriods: [],
    dirtyFrom: null,
    notify: { needsHome: false },
    sorting: null,
    keyId: data.keyId,
    sealed,
  });
  const incomeDocuments = await writeSeedIncome(context, owner.uid, encryption);
  const envelopeDocuments = await writeSeedEnvelopes(
    context,
    owner.uid,
    encryption,
  );
  const billDocuments = await writeSeedBills(context, owner.uid, encryption);
  const goalDocuments = await writeSeedGoals(context, owner.uid, encryption);
  const horizonDocuments = await writeSeedHorizon(
    context,
    owner.uid,
    encryption,
  );
  const lifecycleDocuments = await writeSeedLifecycle(
    context,
    owner.uid,
    encryption,
  );
  const keptDocuments = await writeSeedKeptEnvelope(
    context,
    owner.uid,
    encryption,
  );
  const startDocuments = await writeSeedStart(
    context,
    owner.uid,
    encryption,
    batch,
  );
  const historyDocuments = await writeSeedHistory(
    context,
    owner.uid,
    encryption,
  );
  const masterKeyIds = Object.keys(keyring.keys);
  masterKeyIds.forEach((masterKeyId) =>
    batch.set(
      context.firestore.doc(keyCheckPath(masterKeyId)),
      makeKeyCheck(keyring, masterKeyId, createdAt),
    ),
  );
  batch.set(
    context.firestore.doc('featureGates/runway'),
    {
      appId: 'runway',
      gates: {
        [LINK_BANKS_GATE_ID]: {
          rollout: 'off',
          alwaysOnUids: [
            owner.uid,
            FIXTURE_USERS.partnerTwo.uid,
            FIXTURE_USERS.nineLivesCaretaker.uid,
          ],
          alwaysOffUids: [],
          reason: 'Seeded: Alex, Jamie and Taylor test linking',
          updatedAt: context.now,
        },
      },
    },
    { merge: true },
  );
  await batch.commit();
  const closingDocuments = await seedClosings(
    context,
    owner.uid,
    encryption,
    startOfUtcDay(context.now) - 45 * DAY_MS,
  );
  const trackingDocuments = await seedTrackingPlan(context, keyring);
  const unlinkedDocuments = await seedUnlinkedPlan(context, keyring);

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      trackingDocuments +
      unlinkedDocuments +
      closingDocuments +
      3 +
      incomeDocuments +
      envelopeDocuments +
      billDocuments +
      goalDocuments +
      horizonDocuments +
      lifecycleDocuments +
      keptDocuments +
      startDocuments +
      historyDocuments +
      masterKeyIds.length,
  };
}

/** The next time a month and day comes round, as a date-only value. */
const nextCalendarDay = (today: number, month: number, day: number) => {
  const thisYear = Date.UTC(new Date(today).getUTCFullYear(), month, day);
  return thisYear >= today
    ? thisYear
    : Date.UTC(new Date(today).getUTCFullYear() + 1, month, day);
};

/** Three Horizon items: Moving around the next Jan 15th with a truck and a deposit paid outside the plan, movers (a range) covered by the $800 put toward it and a $100 storage unit from Feb 1st that repeats monthly, Miso's surgery in December (with a $35 monthly medication) with nothing put toward it, taking what it does not cover from the pays before each cost is due, and Sam's wedding, whose $1,200 leaves its venue $230 short. Miso's surgery Medication is already a bill (nothing was held to bring along, so no transfer) on Alex's plan only. Each is a header, a first version and an "Added" change; the money put toward Moving and the wedding is a transfer from Free to Spend with its move change. The surgery's Surgery payment is marked paid at $520.00 (the $50.00 its confirmed day's Surgery line set aside, the other $470.00 from Free to Spend) and Moving's truck is marked paid outside the plan, each with its mark move and payment change. */
async function writeSeedHorizon(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  isTrack = false,
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 3 * DAY_MS;
  const jan15 = nextCalendarDay(today, 0, 15);
  const dec18 = nextCalendarDay(today, 11, 18);
  const dec19 = nextCalendarDay(today, 11, 19);
  const cost = (
    id: string,
    name: string,
    lowCents: number,
    highCents: number,
    anchor: number,
    isOutside = false,
    isMonthly = false,
    pricedOn: number | null = null,
  ): HorizonCost => ({
    id,
    name,
    amount: { lowCents, highCents },
    schedule: isMonthly
      ? {
          kind: 'monthly' as const,
          anchor,
          monthDays: [new Date(anchor).getUTCDate()],
        }
      : { kind: 'once' as const, anchor, monthDays: [] },
    ending: { onDate: null, afterCount: null },
    isOutside,
    pricedOn,
    endsAfter: null,
    becameBillId: null,
    becameBillOn: null,
    priority: null,
    note: null,
  });
  const feb1 = nextCalendarDay(today, 1, 1);
  const dec20 = nextCalendarDay(today, 11, 20);

  const allItems: { id: string; payload: HorizonSealed }[] = [
    {
      id: 'seed-horizon-moving',
      payload: {
        name: 'Moving',
        emoji: '📦',
        happensOn: jan15,
        happensUntil: null,
        priority: 'should',
        orderIndex: 20,
        rest: { kind: 'outside' },
        note: null,
        goalId: null,
        state: 'open' as const,
        stateOn: null,
        stateMoney: null,
        links: [
          {
            changeId: 'seed-change-eating-out-stretch',
            itemId: 'seed-envelope-eating-out',
          },
        ],
        costs: [
          cost(
            'seed-cost-truck',
            'Truck rental',
            12_000,
            12_000,
            jan15 - DAY_MS,
            true,
          ),
          {
            ...cost('seed-cost-movers', 'Movers', 60_000, 80_000, jan15),
            priority: 'must' as const,
          },
          cost(
            'seed-cost-deposit',
            'Deposit',
            25_000,
            25_000,
            jan15 - 5 * DAY_MS,
            true,
          ),
          cost(
            'seed-cost-storage',
            'Storage unit',
            10_000,
            10_000,
            feb1,
            false,
            true,
            today - 2 * DAY_MS,
          ),
        ],
      },
    },
    {
      id: 'seed-horizon-surgery',
      payload: {
        name: "Miso's surgery",
        emoji: '🐱',
        happensOn: dec18,
        happensUntil: null,
        priority: 'must',
        orderIndex: 21,
        rest: { kind: 'pays' },
        note: null,
        goalId: null,
        state: 'open' as const,
        stateOn: null,
        stateMoney: null,
        links: [],
        costs: [
          cost('seed-cost-surgery', 'Surgery', 140_000, 180_000, dec18),
          cost(
            'seed-cost-follow-up',
            'Follow-up visit',
            12_000,
            12_000,
            dec18 + 14 * DAY_MS,
          ),
          cost(
            'seed-cost-medication',
            'Medication',
            3_500,
            3_500,
            dec20,
            false,
            true,
          ),
        ],
      },
    },
    {
      id: 'seed-horizon-wedding',
      payload: {
        name: "Sam's wedding",
        emoji: '💍',
        happensOn: dec19 + 42 * DAY_MS,
        happensUntil: null,
        priority: 'should',
        orderIndex: 22,
        rest: { kind: 'later' },
        note: null,
        goalId: 'seed-goal-wedding',
        state: 'open' as const,
        stateOn: null,
        stateMoney: null,
        links: [],
        costs: [
          cost(
            'goal-seed-goal-wedding',
            'Wedding gift',
            40_000,
            40_000,
            dec19 + 42 * DAY_MS,
          ),
          cost('seed-cost-venue', 'Venue', 143_000, 143_000, dec19),
          cost(
            'seed-cost-photographer',
            'Photographer',
            80_000,
            80_000,
            dec19 + 42 * DAY_MS,
          ),
        ],
      },
    },
    {
      id: 'seed-horizon-couch',
      payload: {
        name: 'New couch',
        emoji: '🛋️',
        happensOn: today - 6 * DAY_MS,
        happensUntil: null,
        priority: 'should',
        orderIndex: 23,
        rest: { kind: 'later' },
        note: null,
        goalId: null,
        state: 'finished' as const,
        stateOn: today - 3 * DAY_MS,
        stateMoney: null,
        links: [],
        costs: [
          cost('seed-cost-couch', 'Couch', 90_000, 90_000, today - 5 * DAY_MS),
        ],
      },
    },
    {
      id: 'seed-horizon-ski',
      payload: {
        name: 'Ski weekend',
        emoji: '⛷️',
        happensOn: feb1 + 30 * DAY_MS,
        happensUntil: null,
        priority: 'want',
        orderIndex: 24,
        rest: { kind: 'later' },
        note: null,
        goalId: null,
        state: 'calledOff' as const,
        stateOn: today - 2 * DAY_MS,
        stateMoney: {
          kind: 'free' as const,
          toId: null,
          cents: 40_000,
          moveId: 'transfer_seed-calloff-seed-horizon-ski',
        },
        links: [],
        costs: [
          cost(
            'seed-cost-lift',
            'Lift tickets',
            40_000,
            40_000,
            feb1 + 30 * DAY_MS,
          ),
          cost('seed-cost-cabin', 'Cabin', 60_000, 60_000, feb1 + 28 * DAY_MS),
          cost(
            'seed-cost-parking',
            'Parking pass',
            2_000,
            2_000,
            feb1 + 25 * DAY_MS,
          ),
        ],
      },
    },
    {
      id: 'seed-horizon-bike',
      payload: {
        name: 'Bike repair',
        emoji: '🚲',
        happensOn: today - 4 * DAY_MS,
        happensUntil: null,
        priority: 'should',
        orderIndex: 25,
        rest: { kind: 'later' },
        note: null,
        goalId: null,
        state: 'open' as const,
        stateOn: null,
        stateMoney: null,
        links: [],
        costs: [
          cost(
            'seed-cost-tuneup',
            'Tune-up',
            12_000,
            12_000,
            today - 4 * DAY_MS,
          ),
        ],
      },
    },
    {
      id: 'seed-horizon-shed',
      payload: {
        name: 'Garden shed',
        emoji: '🏡',
        happensOn: today - 9 * DAY_MS,
        happensUntil: null,
        priority: 'want',
        orderIndex: 26,
        rest: { kind: 'later' },
        note: null,
        goalId: null,
        state: 'finished' as const,
        stateOn: today - DAY_MS,
        stateMoney: {
          kind: 'held' as const,
          toId: null,
          cents: 25_000,
          moveId: null,
        },
        links: [],
        costs: [
          cost('seed-cost-shed', 'Shed', 22_500, 22_500, today - 8 * DAY_MS),
        ],
      },
    },
  ];
  // Track's plan holds only Moving, whose Movers are paid by a purchase.
  const items = isTrack ? allItems.slice(0, 1) : allItems;
  const movedOn = today - 7 * DAY_MS;
  const toward: { itemId: string; cents: number; summary: string }[] = [
    {
      itemId: 'seed-horizon-moving',
      cents: 80_000,
      summary: 'Put $800.00 toward Moving from Free to Spend.',
    },
    {
      itemId: 'seed-horizon-wedding',
      cents: 120_000,
      summary: "Put $1,200.00 toward Sam's wedding from Free to Spend.",
    },
    {
      itemId: 'seed-horizon-couch',
      cents: 90_000,
      summary: 'Put $900.00 toward New couch from Free to Spend.',
    },
    {
      itemId: 'seed-horizon-ski',
      cents: 42_000,
      summary: 'Put $420.00 toward Ski weekend from Free to Spend.',
    },
    {
      itemId: 'seed-horizon-bike',
      cents: 15_000,
      summary: 'Put $150.00 toward Bike repair from Free to Spend.',
    },
    {
      itemId: 'seed-horizon-shed',
      cents: 47_500,
      summary: 'Put $475.00 toward Garden shed from Free to Spend.',
    },
  ].filter(({ itemId }) => items.some(({ id }) => id === itemId));

  const [sealed, addedChanges] = await Promise.all([
    Promise.all(items.map(({ payload }) => sealJson(payload, encryption))),
    Promise.all(
      items.map(({ payload }) =>
        sealJson(
          { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
          encryption,
        ),
      ),
    ),
  ]);

  const transfers = await Promise.all(
    toward.map(async ({ itemId, cents, summary }) => {
      const transfer: TransferSealed = {
        fromId: null,
        toId: itemId,
        cents,
        note: null,
        isOutside: false,
      };
      return {
        itemId,
        transfer,
        sealed: await sealJson(transfer, encryption),
        change: await sealJson(
          { summary, note: null } satisfies ChangeSealed,
          encryption,
        ),
      };
    }),
  );

  const returned: { itemId: string; cents: number }[] = [
    { itemId: 'seed-horizon-ski', cents: 40_000 },
  ].filter(({ itemId }) => items.some(({ id }) => id === itemId));
  const returns = await Promise.all(
    returned.map(async ({ itemId, cents }) => ({
      itemId,
      moveId: `transfer_seed-calloff-${itemId}`,
      sealed: await sealJson(
        {
          fromId: itemId,
          toId: null,
          cents,
          note: null,
          isOutside: false,
        } satisfies TransferSealed,
        encryption,
      ),
    })),
  );
  const ended = await Promise.all(
    items.flatMap(({ id, payload }) =>
      payload.state === 'open' || payload.stateOn === null
        ? []
        : [
            sealJson(
              {
                summary: HORIZON_END_WORDS.endSummary(
                  payload.name,
                  payload.state,
                  payload.stateMoney === null
                    ? null
                    : {
                        kind: payload.stateMoney.kind,
                        cents: formatCents(payload.stateMoney.cents),
                        place: null,
                      },
                ),
                note: null,
              } satisfies ChangeSealed,
              encryption,
            ).then((endSealed) => ({
              id,
              on: payload.stateOn ?? 0,
              sealed: endSealed,
            })),
          ],
    ),
  );

  const marked: {
    itemId: string;
    cost: HorizonCost;
    amountCents: number;
    fromFreeCents: number;
    paidOn: number;
    mark: CostPaidSealed['mark'];
    purchaseId?: string;
  }[] = isTrack
    ? [
        {
          itemId: 'seed-horizon-moving',
          cost: items[0].payload.costs[1],
          amountCents: 60_000,
          fromFreeCents: 0,
          paidOn: today - 4 * DAY_MS,
          mark: 'purchase',
          purchaseId: MOVERS_PURCHASE_ID,
        },
      ]
    : [
        {
          itemId: 'seed-horizon-surgery',
          cost: items[1].payload.costs[0],
          amountCents: 52_000,
          fromFreeCents: settleCostPaid(52_000, 5_000).fromFreeCents,
          paidOn: today - 2 * DAY_MS,
          mark: 'item',
        },
        {
          itemId: 'seed-horizon-moving',
          cost: items[0].payload.costs[0],
          amountCents: 12_000,
          fromFreeCents: 0,
          paidOn: today - DAY_MS,
          mark: 'outside',
        },
        {
          itemId: 'seed-horizon-couch',
          cost: items[3].payload.costs[0],
          amountCents: 90_000,
          fromFreeCents: 0,
          paidOn: today - 4 * DAY_MS,
          mark: 'item',
        },
        {
          itemId: 'seed-horizon-ski',
          cost: items[4].payload.costs[2],
          amountCents: 2_000,
          fromFreeCents: 0,
          paidOn: today - 6 * DAY_MS,
          mark: 'item',
        },
        {
          itemId: 'seed-horizon-bike',
          cost: items[5].payload.costs[0],
          amountCents: 12_000,
          fromFreeCents: 0,
          paidOn: today - 3 * DAY_MS,
          mark: 'item',
        },
        {
          itemId: 'seed-horizon-shed',
          cost: items[6].payload.costs[0],
          amountCents: 22_500,
          fromFreeCents: 0,
          paidOn: today - 2 * DAY_MS,
          mark: 'item',
        },
      ];
  const marks = await Promise.all(
    marked.map(async ({ itemId, cost: paidCost, ...paid }) => {
      const itemName =
        items.find(({ id }) => id === itemId)?.payload.name ?? itemId;
      const dueOn = paidCost.schedule.anchor ?? today;
      const moveId = getCostPaidMoveId(itemId, paidCost.id, dueOn, 0);
      const payload: CostPaidSealed = {
        costId: paidCost.id,
        dueOn,
        amountCents: paid.amountCents,
        paidOn: paid.paidOn,
        fromFreeCents: paid.fromFreeCents,
        mark: paid.mark,
        purchaseId: paid.purchaseId ?? null,
      };
      const undoText = describeCostTakenBack(
        paidCost.name,
        itemName,
        dueOn,
        paid.amountCents,
        paid.fromFreeCents,
        paid.mark,
      );
      return {
        itemId,
        moveId,
        dueOn,
        paidOn: paid.paidOn,
        sealed: await sealJson(payload, encryption),
        change: await sealJson(
          {
            summary: describeCostPaid(
              paidCost.name,
              itemName,
              dueOn,
              paid.amountCents,
              paid.mark,
            ),
            note: null,
            move: {
              moveId,
              date: dueOn,
              fromId: null,
              toId: null,
              cents: paid.amountCents,
              note: null,
              isOutside: false,
              undoText,
              isUndo: false,
              bill: null,
              cost: {
                itemId,
                itemName,
                costId: paidCost.id,
                name: paidCost.name,
                dueOn,
                paidOn: paid.paidOn,
                amountCents: paid.amountCents,
                fromFreeCents: paid.fromFreeCents,
                mark: paid.mark,
                purchaseId: paid.purchaseId ?? null,
              },
            },
          } satisfies ChangeSealed,
          encryption,
        ),
      };
    }),
  );

  const batch = context.firestore.batch();
  marks.forEach(
    ({ itemId, moveId, dueOn, paidOn, sealed: markSealed, change }) => {
      const createdAt = paidOn + 10 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
        id: moveId,
        kind: 'costPaid',
        date: dueOn,
        refId: itemId,
        reversesMoveId: null,
        createdAt,
        sealed: markSealed,
      } satisfies MoveDoc);
      batch.set(
        context.firestore.doc(`${plan}/changes/seed-change-${moveId}`),
        {
          id: `seed-change-${moveId}`,
          kind: 'paymentChange',
          createdAt,
          effectiveFrom: null,
          itemIds: [itemId],
          sealed: change,
        } satisfies ChangeDoc,
      );
    },
  );
  transfers.forEach(
    ({ itemId, transfer, sealed: moveSealed, change: moveChange }) => {
      const moveId = `transfer_seed-toward-${itemId}`;
      const createdAt = movedOn + 10 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
        id: moveId,
        kind: 'transfer',
        date: movedOn,
        refId: transfer.toId,
        reversesMoveId: null,
        createdAt,
        sealed: moveSealed,
      } satisfies MoveDoc);
      batch.set(
        context.firestore.doc(`${plan}/changes/seed-change-toward-${itemId}`),
        {
          id: `seed-change-toward-${itemId}`,
          kind: 'moveChange',
          createdAt,
          effectiveFrom: null,
          itemIds: [itemId],
          sealed: moveChange,
        } satisfies ChangeDoc,
      );
    },
  );
  returns.forEach(({ itemId, moveId, sealed: moveSealed }) => {
    batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
      id: moveId,
      kind: 'transfer',
      date: movedOn,
      refId: itemId,
      reversesMoveId: null,
      createdAt: movedOn + 11 * 3_600_000,
      sealed: moveSealed,
    } satisfies MoveDoc);
  });
  ended.forEach(({ id, on, sealed: endSealed }) => {
    const changeId = `seed-change-end-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, on + 10 * 3_600_000, on, [id], endSealed),
    );
  });
  items.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'horizon', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'horizon',
        createdAt,
        today,
        changeId,
        sealed[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], addedChanges[index]),
    );
  });
  const surgery = items.find(({ id }) => id === 'seed-horizon-surgery');
  const medication = surgery?.payload.costs.find(
    ({ id }) => id === 'seed-cost-medication',
  );
  const billId = getMadeBillId('seed-horizon-surgery', 'seed-cost-medication');
  if (surgery && medication && medication.schedule.anchor !== null) {
    const madeAt = context.now - DAY_MS;
    const bill: BillSealed = {
      name: medication.name,
      emoji: null,
      priority: surgery.payload.priority,
      orderIndex: 99,
      amount: medication.amount,
      timing: { kind: 'date', schedule: medication.schedule },
      ending: medication.ending,
      fundedBy: { kind: 'suggested' },
      stanceOverride: null,
      groupId: null,
    };
    const madeChangeId = 'seed-change-medication-bill';
    const [billSealed, itemSealed, madeSealed] = await Promise.all([
      sealJson(bill, encryption),
      sealJson(
        setCostBill(
          surgery.payload,
          medication.id,
          billId,
          medication.schedule.anchor,
        ),
        encryption,
      ),
      sealJson(
        {
          summary: describeCostMadeBill(
            surgery.payload.name,
            medication.name,
            bill,
            0,
            0,
          ),
        } satisfies ChangeSealed,
        encryption,
      ),
    ]);
    batch.set(
      context.firestore.doc(`${plan}/items/${billId}`),
      header(billId, 'bill', null, madeAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${billId}`),
      version(
        `seed-version-${billId}`,
        billId,
        'bill',
        madeAt,
        today,
        madeChangeId,
        billSealed,
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${surgery.id}-bill`),
      version(
        `seed-version-${surgery.id}-bill`,
        surgery.id,
        'horizon',
        madeAt,
        today,
        madeChangeId,
        itemSealed,
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${madeChangeId}`),
      change(madeChangeId, madeAt, today, [surgery.id, billId], madeSealed),
    );
  }
  await batch.commit();
  return (
    items.length * 3 +
    transfers.length * 2 +
    returns.length * 2 +
    marks.length * 2 +
    (surgery ? 4 : 0)
  );
}

const MOVERS_PURCHASE_ID = 'seed-purchase-movers';

const KEPT_ENVELOPE_ID = 'seed-envelope-concert';

/** Concert tickets, funded on the confirmed day eleven days ago and archived since with its $60.00 kept, so Envelopes lists it under "Stopped, still holding money" and its sheet offers "Release what it holds". */
async function writeSeedKeptEnvelope(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 40 * DAY_MS;
  const archivedAt = today - 3 * DAY_MS;
  const payload: EnvelopeSealed = {
    name: 'Concert tickets',
    emoji: '🎫',
    priority: 'want',
    orderIndex: 11,
    groupId: null,
    maxCents: null,
    spillTo: [],
    funding: {
      amount: { kind: 'exact', cents: 6_000 },
      cadence: { kind: 'everyIncomeDay' },
    },
  };
  const [sealed, added, archived] = await Promise.all([
    sealJson(payload, encryption),
    sealJson(
      { summary: 'Added Concert tickets.' } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Concert tickets: archived.',
        note: 'Saving it for the next tour',
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  const startsOn = today - 40 * DAY_MS;
  const batch = context.firestore.batch();
  batch.set(context.firestore.doc(`${plan}/items/${KEPT_ENVELOPE_ID}`), {
    ...header(KEPT_ENVELOPE_ID, 'envelope', null, addedAt),
    archivedAt,
    heldReleasedOn: null,
  });
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-${KEPT_ENVELOPE_ID}`),
    version(
      `seed-version-${KEPT_ENVELOPE_ID}`,
      KEPT_ENVELOPE_ID,
      'envelope',
      addedAt,
      startsOn,
      `seed-change-${KEPT_ENVELOPE_ID}`,
      sealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-${KEPT_ENVELOPE_ID}`),
    change(
      `seed-change-${KEPT_ENVELOPE_ID}`,
      addedAt,
      startsOn,
      [KEPT_ENVELOPE_ID],
      added,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-concert-archived`),
    change(
      'seed-change-concert-archived',
      archivedAt + 10 * 3_600_000,
      archivedAt,
      [KEPT_ENVELOPE_ID],
      archived,
    ),
  );
  await batch.commit();
  return 4;
}

/** Items that change for a stretch or stop (Home projects asks $1,500.00 every income day at rank 2.5 in Should, so the first coming pay runs out inside Should and Priorities draws its line there): Eating out at $40 for the next four income days then back to $80, Meal kit that ends in a month, an old phone plan that ended, a paused goal and an archived envelope. Each has its entries, the ended ones the `ended_` one. */
async function writeSeedLifecycle(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 9 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });
  const money = (cents: number) => ({ lowCents: cents, highCents: cents });
  const daily = {
    amount: exact(0),
    cadence: { kind: 'everyIncomeDay' as const },
  };
  const funding = (cents: number) => ({ ...daily, amount: exact(cents) });
  const envelope = (
    name: string,
    emoji: string | null,
    cents: number,
    orderIndex: number,
  ): EnvelopeSealed => ({
    name,
    emoji,
    priority: 'want',
    orderIndex,
    groupId: null,
    maxCents: null,
    spillTo: [],
    funding: funding(cents),
  });
  const phonePlan: BillSealed = {
    name: 'Old phone plan',
    emoji: null,
    priority: 'should',
    orderIndex: 9,
    amount: money(4_500),
    timing: {
      kind: 'date',
      schedule: {
        kind: 'monthly',
        anchor: today - 90 * DAY_MS,
        monthDays: [5],
      },
    },
    ending: { onDate: null, afterCount: null },
    fundedBy: { kind: 'suggested' },
    stanceOverride: null,
    groupId: null,
  };
  const pausedGoal: GoalSealed = {
    name: 'Car repair',
    emoji: '🚗',
    priority: 'want',
    orderIndex: 5,
    targetCents: 90_000,
    targetDate: null,
    funding: funding(10_000),
    state: 'paused',
    groupId: null,
  };

  const stretchStart = firstPayday + DAY_MS;
  const stretchEnd = firstPayday + 17 * DAY_MS + DAY_MS;
  const items = [
    {
      id: 'seed-envelope-eating-out',
      kind: 'envelope',
      payload: envelope('Eating out', '🍜', 8_000, 8),
    },
    {
      id: 'seed-envelope-meal-kit',
      kind: 'envelope',
      payload: envelope('Meal kit', null, 3_500, 9),
      endedAt: today + 30 * DAY_MS,
    },
    {
      id: 'seed-bill-old-phone',
      kind: 'bill',
      payload: phonePlan,
      endedAt: today - 20 * DAY_MS,
    },
    { id: 'seed-goal-car-repair', kind: 'goal', payload: pausedGoal },
    {
      id: 'seed-envelope-home-projects',
      kind: 'envelope',
      payload: {
        name: 'Home projects',
        emoji: '🛠️',
        priority: 'should',
        orderIndex: 2.5,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: funding(150_000),
      } satisfies EnvelopeSealed,
    },
    {
      id: 'seed-envelope-old-hobby',
      kind: 'envelope',
      payload: envelope('Pottery class', '🏺', 2_500, 10),
      archivedAt: today - 5 * DAY_MS,
    },
  ] as const;

  const sealed = await Promise.all(
    items.map(({ payload }) => sealJson(payload, encryption)),
  );
  const addedChanges = await Promise.all(
    items.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const stretchPayload = envelope('Eating out', '🍜', 4_000, 8);
  const [
    stretchSealed,
    stretchChange,
    mealKitEnded,
    phoneEnded,
    hobbyArchived,
  ] = await Promise.all([
    sealJson(stretchPayload, encryption),
    sealJson(
      {
        summary: `Eating out: Funding $80.00 every income day to $40.00 every income day, from ${formatDateOrdinalUTC(stretchStart)} through ${formatDateOrdinalUTC(stretchEnd - DAY_MS)}, then it goes back.`,
        note: 'Covering the car registration',
      } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Meal kit: ended after its last box.',
        note: 'Cancelling the subscription',
      } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Old phone plan: ended.',
        note: 'Switched to a cheaper plan',
      } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Pottery class: archived.',
        note: 'Finished the course',
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);

  const batch = context.firestore.batch();
  items.forEach((entry, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${entry.id}`;
    const startsOn =
      entry.id === 'seed-bill-old-phone' ? today - 90 * DAY_MS : today;
    batch.set(context.firestore.doc(`${plan}/items/${entry.id}`), {
      ...header(entry.id, entry.kind, null, createdAt),
      endedAt: 'endedAt' in entry ? entry.endedAt : null,
      archivedAt: 'archivedAt' in entry ? entry.archivedAt : null,
      heldReleasedOn:
        'archivedAt' in entry
          ? entry.archivedAt
          : 'endedAt' in entry
            ? entry.endedAt + DAY_MS
            : null,
    });
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${entry.id}`),
      version(
        `seed-version-${entry.id}`,
        entry.id,
        entry.kind,
        createdAt,
        startsOn,
        changeId,
        sealed[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, startsOn, [entry.id], addedChanges[index]),
    );
  });
  const stretchAt = context.now - 2 * DAY_MS;
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-eating-out-stretch`),
    {
      ...version(
        'seed-version-eating-out-stretch',
        'seed-envelope-eating-out',
        'envelope',
        stretchAt,
        stretchStart,
        'seed-change-eating-out-stretch',
        stretchSealed,
      ),
      effectiveUntil: stretchEnd,
    },
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-eating-out-stretch`),
    change(
      'seed-change-eating-out-stretch',
      stretchAt,
      stretchStart,
      ['seed-envelope-eating-out'],
      stretchChange,
    ),
  );
  const endedEntry = (itemId: string, on: number, sealedEntry: unknown) => ({
    id: `ended_${itemId}`,
    kind: 'ended',
    createdAt: stretchAt,
    effectiveFrom: on,
    itemIds: [itemId],
    sealed: sealedEntry,
  });
  batch.set(
    context.firestore.doc(`${plan}/changes/ended_seed-envelope-meal-kit`),
    endedEntry('seed-envelope-meal-kit', today + 30 * DAY_MS, mealKitEnded),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/ended_seed-bill-old-phone`),
    endedEntry('seed-bill-old-phone', today - 20 * DAY_MS, phoneEnded),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-old-hobby-archived`),
    change(
      'seed-change-old-hobby-archived',
      stretchAt,
      today - 5 * DAY_MS,
      ['seed-envelope-old-hobby'],
      hobbyArchived,
    ),
  );
  await batch.commit();
  return items.length * 3 + 5;
}

const HISTORY_ITEMS = [
  ['seed-envelope-groceries', 'Groceries'],
  ['seed-envelope-gas', 'Gas'],
  ['seed-goal-vacation', 'Vacation fund'],
] as const;

/** Sixty older changes, fifty of them in the 90 days before the recent ones so one window holds 50 entries and paging back finds them, one that was made 45 days ago for a day later confirmed, and one sealed under a key this plan does not have, which the log shows as unreadable. */
async function writeSeedHistory(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const notes = ['Prices went up', null, 'Covering the car registration'];
  const entries = Array.from({ length: 60 }, (_, index) => {
    const [itemId, name] = HISTORY_ITEMS[index % HISTORY_ITEMS.length];
    const age = index < 50 ? 100 + index * 0.55 : 130 + (index - 50) * 28;
    const cents = 20_000 + index * 500;
    return {
      id: `seed-history-${index}`,
      itemId,
      createdAt: today - Math.round(age * DAY_MS),
      summary: `${name}: Funding $${(cents / 100).toFixed(2)} every income day to $${((cents + 500) / 100).toFixed(2)} every income day, from now on.`,
      note: notes[index % notes.length],
    };
  });
  const linked = {
    id: 'seed-history-confirmed-day',
    itemId: 'seed-envelope-groceries',
    createdAt: today - 45 * DAY_MS,
    summary:
      'Groceries: Funding $150.00 every income day to $160.00 every income day, from now on.',
    note: 'Before the bonus',
  };
  const wrongKey = {
    ...encryption,
    key: 'ab'.repeat(32),
  };
  const all = [
    ...entries,
    linked,
    {
      id: 'seed-history-unreadable',
      itemId: 'seed-envelope-gas',
      createdAt: today - 60 * DAY_MS,
      summary: 'Gas: Funding changed.',
      note: null,
    },
  ];
  const sealedEntries = await Promise.all(
    all.map((entry) =>
      sealJson(
        { summary: entry.summary, note: entry.note } satisfies ChangeSealed,
        entry.id === 'seed-history-unreadable' ? wrongKey : encryption,
      ),
    ),
  );
  const batch = context.firestore.batch();
  all.forEach((entry, index) =>
    batch.set(
      context.firestore.doc(`${plan}/changes/${entry.id}`),
      change(
        entry.id,
        entry.createdAt,
        entry.createdAt,
        [entry.itemId],
        sealedEntries[index],
      ),
    ),
  );
  await batch.commit();
  return all.length;
}

const SEED_FEE_BILL = 'seed-bill-venture-fee';
const SEED_VENTURE_CARD = 'seed-card-venture';
const SEED_LINK = 'seed-link-capital-one';
const SEED_WEALTHFRONT_LINK = 'seed-link-wealthfront';
const SEED_CHASE_CARD = 'seed-card-chase';
const SEED_DISCOVER_CARD = 'seed-card-discover';

/** Three cards: a Capital One Venture X that owed $250.00 on the starting day and was paid off in two payments (the $35.00 minimum twelve days ago, the rest ten days ago), an unnamed Chase that the car registration is charged to, marked paid, whose due day passed three days ago unpaid, and a Discover it owing $140.00, due in two days and paid from Checking B, so the last paycheck has money to move. One bank link holds the Venture X and Checking A (a third provider account was skipped), with their balances. Ten documents. */
async function writeSeedCards(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const startDate = today - 45 * DAY_MS;
  const createdAt = context.now - 14 * DAY_MS;
  const cards: { id: string; sealed: CardSealed; createdAt: number }[] = [
    {
      id: SEED_VENTURE_CARD,
      sealed: {
        issuer: 'Capital One',
        name: 'Venture X - Credit Holder XXXXXXX3153',
        dueDay: 14,
        annualFee: {
          cents: 39_500,
          firstDueOn: today + 120 * DAY_MS,
          billId: SEED_FEE_BILL,
        },
      },
      createdAt,
    },
    {
      id: SEED_CHASE_CARD,
      sealed: {
        issuer: 'Chase',
        name: null,
        dueDay: new Date(today - 3 * DAY_MS).getUTCDate(),
      },
      createdAt: createdAt + 60_000,
    },
    {
      id: SEED_DISCOVER_CARD,
      sealed: {
        issuer: 'Discover',
        name: 'it',
        dueDay: new Date(today + 2 * DAY_MS).getUTCDate(),
        payFromAccountId: 'seed-account-checking-b',
      },
      createdAt: createdAt + 120_000,
    },
  ];
  await Promise.all(
    cards.map(async (card) => {
      batch.set(context.firestore.doc(`${plan}/cards/${card.id}`), {
        id: card.id,
        createdAt: card.createdAt,
        updatedAt: card.createdAt,
        archivedAt: null,
        linkId: card.id === SEED_VENTURE_CARD ? SEED_LINK : null,
        sealed: await sealJson(card.sealed, encryption),
      } satisfies CardDoc);
    }),
  );
  const feeBill = buildFeeBill({
    cardId: SEED_VENTURE_CARD,
    name: CARD_FEE_WORDS.billName('Capital One Venture X'),
    cents: 39_500,
    firstDueOn: today + 120 * DAY_MS,
    priority: 'should',
    orderIndex: 6,
  });
  const feeGroup: GroupSealed = {
    name: CARD_FEE_WORDS.groupName,
    startingPriority: null,
    envelopePriority: null,
    goalPriority: null,
    emoji: null,
  };
  const feeEntries = [
    {
      id: CARD_FEE_GROUP_ID,
      kind: 'group' as const,
      payload: feeGroup,
      summary: CARD_FEE_WORDS.groupStarted,
    },
    {
      id: SEED_FEE_BILL,
      kind: 'bill' as const,
      payload: feeBill,
      summary: CARD_FEE_WORDS.billAdded(
        feeBill.name,
        formatCents(39_500),
        formatDateOrdinalUTC(today + 120 * DAY_MS),
      ),
    },
  ];
  await Promise.all(
    feeEntries.map(async (entry) => {
      batch.set(context.firestore.doc(`${plan}/items/${entry.id}`), {
        id: entry.id,
        kind: entry.kind,
        parentId: null,
        createdAt,
        endedAt: null,
        archivedAt: null,
        heldReleasedOn: null,
      });
      batch.set(
        context.firestore.doc(`${plan}/versions/seed-version-${entry.id}`),
        {
          id: `seed-version-${entry.id}`,
          itemId: entry.id,
          kind: entry.kind,
          createdAt,
          effectiveFrom: startDate,
          effectiveUntil: null,
          changeId: `seed-change-${entry.id}`,
          sealed: await sealJson(entry.payload, encryption),
        },
      );
      batch.set(
        context.firestore.doc(`${plan}/changes/seed-change-${entry.id}`),
        {
          id: `seed-change-${entry.id}`,
          kind: 'planChange',
          createdAt,
          effectiveFrom: null,
          itemIds: [entry.id],
          sealed: await sealJson(
            { summary: entry.summary, note: null } satisfies ChangeSealed,
            encryption,
          ),
        } satisfies ChangeDoc,
      );
    }),
  );
  batch.set(context.firestore.doc(`${plan}/links/${SEED_LINK}`), {
    id: SEED_LINK,
    status: 'active',
    lastSyncAt: context.now - 2 * 60_000,
    createdAt,
    needsCardConsent: null,
    cardDetails: 'shared',
    sealed: await sealJson(
      {
        institutionName: 'Capital One',
        institutionLogo: SEED_LOGO_RED,
        providerAccounts: [
          {
            providerAccountId: 'seed-provider-venture',
            name: 'Venture X',
            kind: 'credit',
            mask: '8841',
            balanceCents: 0,
            accountId: null,
            cardId: SEED_VENTURE_CARD,
            isSkipped: false,
          },
          {
            providerAccountId: 'seed-provider-checking',
            name: '360 Checking',
            kind: 'depository',
            mask: '4821',
            balanceCents: 221_450,
            accountId: 'seed-account-checking-a',
            cardId: null,
            isSkipped: false,
          },
          {
            providerAccountId: 'seed-provider-savings',
            name: '360 Savings',
            kind: 'depository',
            mask: '3302',
            balanceCents: 1_250_000,
            accountId: null,
            cardId: null,
            isSkipped: true,
          },
        ],
      } satisfies LinkSealed,
      encryption,
    ),
  } satisfies LinkDoc);
  batch.set(
    context.firestore.doc(`${plan}/accountBalances/${SEED_VENTURE_CARD}`),
    {
      id: SEED_VENTURE_CARD,
      asOf: context.now - 2 * 60_000,
      sealed: await sealJson(
        {
          cents: 0,
          availableCents: null,
          limitCents: 1_000_000,
          hasInstantBalance: false,
        },
        encryption,
      ),
    } satisfies AccountBalanceDoc,
  );
  const statementOn = today - 20 * DAY_MS;
  batch.set(
    context.firestore.doc(`${plan}/cardStatements/${SEED_VENTURE_CARD}`),
    {
      id: SEED_VENTURE_CARD,
      asOf: context.now - 2 * 60_000,
      sealed: await sealJson(
        {
          minimumCents: 3_500,
          statementCents: 41_200,
          statementOn,
          dueOn: today + 9 * DAY_MS,
          lastPaymentCents: 30_000,
          lastPaymentOn: statementOn - 10 * DAY_MS,
        } satisfies CardStatementSealed,
        encryption,
      ),
    } satisfies CardStatementDoc,
  );
  const discoverStartId = `start_${SEED_DISCOVER_CARD}_${createdAt + 120_000}`;
  batch.set(context.firestore.doc(`${plan}/moves/${discoverStartId}`), {
    id: discoverStartId,
    kind: 'start',
    date: startDate,
    refId: SEED_DISCOVER_CARD,
    reversesMoveId: null,
    createdAt: createdAt + 120_000,
    sealed: await sealJson(
      { amountCents: 14_000, holding: 'card' } satisfies StartSealed,
      encryption,
    ),
  } satisfies MoveDoc);
  const startId = `start_${SEED_VENTURE_CARD}_${createdAt}`;
  batch.set(context.firestore.doc(`${plan}/moves/${startId}`), {
    id: startId,
    kind: 'start',
    date: startDate,
    refId: SEED_VENTURE_CARD,
    reversesMoveId: null,
    createdAt,
    sealed: await sealJson(
      { amountCents: 25_000, holding: 'card' } satisfies StartSealed,
      encryption,
    ),
  } satisfies MoveDoc);
  await Promise.all(
    (
      [
        { days: 12, cents: 3_500, covers: 'minimum' },
        { days: 10, cents: 21_500, covers: 'full' },
      ] as const
    ).map(async (payment) => {
      const paidOn = today - payment.days * DAY_MS;
      const paymentId = `cardpay_${SEED_VENTURE_CARD}_${toDayStamp(paidOn)}_1`;
      batch.set(context.firestore.doc(`${plan}/moves/${paymentId}`), {
        id: paymentId,
        kind: 'cardPayment',
        date: paidOn,
        refId: SEED_VENTURE_CARD,
        reversesMoveId: null,
        createdAt: paidOn + 10 * 3_600_000,
        sealed: await sealJson(
          {
            amountCents: payment.cents,
            covers: payment.covers,
          } satisfies CardPaymentSealed,
          encryption,
        ),
      } satisfies MoveDoc);
    }),
  );
  const carDueOn = today + 40 * DAY_MS;
  const carId = getPaidMoveId('seed-bill-car', carDueOn, 0);
  batch.set(context.firestore.doc(`${plan}/moves/${carId}`), {
    id: carId,
    kind: 'billPaid',
    date: carDueOn,
    refId: 'seed-bill-car',
    reversesMoveId: null,
    createdAt: today - DAY_MS + 10 * 3_600_000,
    sealed: await sealJson(
      {
        amountCents: 18_500,
        paidOn: today - DAY_MS,
        fromFreeCents: 12_500,
        cardId: SEED_CHASE_CARD,
      } satisfies BillPaidSealed,
      encryption,
    ),
  } satisfies MoveDoc);
  return cards.length + 5 + 3;
}

const SEED_WEALTHFRONT_GOALS = [
  'seed-goal-vacation',
  'seed-goal-cushion',
  'seed-goal-phone',
];

async function writeSeedAccounts(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
) {
  const plan = `apps/runway/plans/${uid}`;
  const createdAt = context.now - 14 * DAY_MS;
  const balanceOn = startOfUtcDay(context.now);
  const base = {
    countedTowardTotal: true,
    isPullAccount: false,
    lastFour: null,
    balanceOn,
    holds: [],
    apyBps: null,
    interestDay: null,
  } satisfies Partial<AccountSealed>;
  const accounts: { id: string; sealed: AccountSealed }[] = [
    {
      id: 'seed-account-checking-a',
      sealed: {
        ...base,
        name: 'Checking A',
        institution: 'Capital One',
        kind: 'checking',
        lastFour: '4821',
        balanceCents: 214_000,
      },
    },
    {
      id: 'seed-account-checking-b',
      sealed: {
        ...base,
        name: 'Checking B',
        institution: 'Capital One',
        kind: 'checking',
        lastFour: '1177',
        isPullAccount: true,
        balanceCents: 65_000,
        balanceOn: balanceOn - 14 * DAY_MS,
      },
    },
    {
      id: 'seed-account-wealthfront',
      sealed: {
        ...base,
        name: 'Wealthfront Cash',
        institution: 'Wealthfront',
        kind: 'cashManagement',
        balanceCents: 80_000,
        holds: SEED_WEALTHFRONT_GOALS,
        apyBps: 410,
        interestDay: null,
      },
    },
  ];
  const linkIdFor = (id: string) =>
    id === 'seed-account-checking-a'
      ? SEED_LINK
      : id === 'seed-account-wealthfront'
        ? SEED_WEALTHFRONT_LINK
        : null;
  await Promise.all(
    accounts.map(async (account, index) => {
      batch.set(context.firestore.doc(`${plan}/accounts/${account.id}`), {
        id: account.id,
        createdAt: createdAt + index * 60_000,
        updatedAt: createdAt + index * 60_000,
        archivedAt: null,
        linkId: linkIdFor(account.id),
        sealed: await sealJson(account.sealed, encryption),
      } satisfies AccountDoc);
    }),
  );
  batch.set(
    context.firestore.doc(`${plan}/accountBalances/seed-account-checking-a`),
    {
      id: 'seed-account-checking-a',
      asOf: context.now - 2 * 60_000,
      sealed: await sealJson(
        {
          cents: 221_450,
          availableCents: 21_450,
          limitCents: null,
          hasInstantBalance: true,
        },
        encryption,
      ),
    } satisfies AccountBalanceDoc,
  );
  batch.set(context.firestore.doc(`${plan}/links/${SEED_WEALTHFRONT_LINK}`), {
    id: SEED_WEALTHFRONT_LINK,
    status: 'active',
    lastSyncAt: context.now - 2 * 60_000,
    createdAt,
    needsCardConsent: null,
    cardDetails: null,
    sealed: await sealJson(
      {
        institutionName: 'Wealthfront',
        institutionLogo: SEED_LOGO_PURPLE,
        providerAccounts: [
          {
            providerAccountId: 'seed-provider-wealthfront',
            name: 'Cash Account',
            kind: 'depository',
            mask: '6205',
            balanceCents: 82_400,
            accountId: 'seed-account-wealthfront',
            cardId: null,
            isSkipped: false,
          },
        ],
      } satisfies LinkSealed,
      encryption,
    ),
  } satisfies LinkDoc);
  batch.set(
    context.firestore.doc(`${plan}/accountBalances/seed-account-wealthfront`),
    {
      id: 'seed-account-wealthfront',
      asOf: context.now - 3 * 60 * 60_000,
      sealed: await sealJson(
        {
          cents: 82_400,
          availableCents: 82_400,
          limitCents: null,
          hasInstantBalance: true,
        },
        encryption,
      ),
    } satisfies AccountBalanceDoc,
  );
  return accounts.length + 3;
}

/** The starting point, 45 days back so every confirmed day counts: $3,400.00 on hand, two goals part-filled and two bills part set aside, and $42.00 moved from Groceries to the Vacation fund three days ago. Two changes and six moves. */
async function writeSeedStart(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
) {
  const plan = `apps/runway/plans/${uid}`;
  const startDate = startOfUtcDay(context.now) - 45 * DAY_MS;
  const createdAt = context.now - 14 * DAY_MS;
  const holdings: {
    refId: string | null;
    holding: StartHolding;
    cents: number;
  }[] = [
    { refId: null, holding: 'money', cents: 340_000 },
    { refId: 'seed-goal-vacation', holding: 'goal', cents: 25_000 },
    { refId: 'seed-goal-cushion', holding: 'goal', cents: 20_000 },
    { refId: 'seed-bill-rent', holding: 'bill', cents: 45_000 },
    { refId: 'seed-bill-car', holding: 'bill', cents: 6_000 },
  ];
  const changeId = 'seed-change-start';
  batch.set(context.firestore.doc(`${plan}/changes/${changeId}`), {
    id: changeId,
    kind: 'start',
    createdAt,
    effectiveFrom: startDate,
    itemIds: [],
    sealed: await sealJson(
      {
        summary: `Started from ${formatDateOrdinalUTC(startDate)}.`,
      } satisfies ChangeSealed,
      encryption,
    ),
  });
  await Promise.all(
    holdings.map(async ({ refId, holding, cents }) => {
      const id = `start_${refId ?? 'money'}_${createdAt}`;
      const move: MoveDoc = {
        id,
        kind: 'start',
        date: startDate,
        refId,
        reversesMoveId: null,
        createdAt,
        sealed: await sealJson(
          { amountCents: cents, holding } satisfies StartSealed,
          encryption,
        ),
      };
      batch.set(context.firestore.doc(`${plan}/moves/${id}`), move);
    }),
  );
  const movedOn = startOfUtcDay(context.now) - 3 * DAY_MS;
  const transferId = 'transfer_seed-groceries-to-vacation';
  const transfer: TransferSealed = {
    fromId: 'seed-envelope-groceries',
    toId: 'seed-goal-vacation',
    cents: 4_200,
    note: null,
    isOutside: false,
  };
  batch.set(context.firestore.doc(`${plan}/moves/${transferId}`), {
    id: transferId,
    kind: 'transfer',
    date: movedOn,
    refId: transfer.fromId,
    reversesMoveId: null,
    createdAt: movedOn + 10 * 3_600_000,
    sealed: await sealJson(transfer, encryption),
  } satisfies MoveDoc);
  batch.set(context.firestore.doc(`${plan}/changes/seed-change-transfer`), {
    id: 'seed-change-transfer',
    kind: 'moveChange',
    createdAt: movedOn + 10 * 3_600_000,
    effectiveFrom: null,
    itemIds: [transfer.fromId, transfer.toId ?? ''],
    sealed: await sealJson(
      {
        summary: 'Moved $42.00 from Groceries to Vacation fund.',
        note: null,
      } satisfies ChangeSealed,
      encryption,
    ),
  });
  return 3 + holdings.length;
}

/** One source with two pay lines, sealed the way the app seals them: a paycheck every other week that ends after six, and a bonus that arrives once. */
async function writeSeedIncome(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  payAccountId: string | null = null,
  /** A bill the latest confirmed payday also set money aside for, in full. */
  extraBillLine: ExtraBillLine | null = null,
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 13 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const bonusDay = today + 20 * DAY_MS;
  const freelanceDay = today + 6 * DAY_MS;

  const source: SourceSealed = { name: 'Northwind Studio', pairings: [] };
  const paycheck: PayLineSealed = {
    name: 'Paycheck',
    schedule: { kind: 'everyOtherWeek', anchor: firstPayday, monthDays: [] },
    amount: { lowCents: 214_000, highCents: 214_000 },
    ending: { onDate: null, afterCount: 6 },
    stanceOverride: null,
    accountId: payAccountId,
    pairings: [
      {
        targetItemId: 'seed-envelope-groceries',
        amount: { kind: 'exact', cents: 30_000 },
        topUpFromAnySource: false,
      },
    ],
  };
  const bonus: PayLineSealed = {
    name: 'Spring bonus',
    schedule: { kind: 'once', anchor: bonusDay, monthDays: [] },
    amount: { lowCents: 90_000, highCents: 90_000 },
    ending: { onDate: null, afterCount: null },
    stanceOverride: null,
    accountId: null,
    pairings: [
      {
        targetItemId: 'seed-envelope-savings',
        amount: { kind: 'exact', cents: 95_000 },
        topUpFromAnySource: true,
      },
      {
        targetItemId: 'seed-envelope-trip',
        amount: { kind: 'exact', cents: 20_000 },
        topUpFromAnySource: false,
      },
    ],
  };
  const freelance: PayLineSealed = {
    name: 'Freelance payment',
    schedule: { kind: 'once', anchor: freelanceDay, monthDays: [] },
    amount: { lowCents: 12_000, highCents: 18_000 },
    ending: { onDate: null, afterCount: null },
    stanceOverride: null,
    accountId: null,
    pairings: [
      {
        targetItemId: 'seed-bill-rent',
        amount: { kind: 'exact', cents: 15_000 },
        topUpFromAnySource: false,
      },
    ],
  };
  const summaries: ChangeSealed[] = [
    { summary: 'Added Paycheck from Northwind Studio, $2,140.00.' },
    { summary: 'Added Spring bonus from Northwind Studio, $900.00.' },
    {
      summary:
        'Added Freelance payment from Northwind Studio, $120.00 to $180.00.',
    },
  ];

  const [
    sourceSealed,
    paycheckSealed,
    bonusSealed,
    freelanceSealed,
    firstChange,
    secondChange,
    thirdChange,
  ] = await Promise.all([
    sealJson(source, encryption),
    sealJson(paycheck, encryption),
    sealJson(bonus, encryption),
    sealJson(freelance, encryption),
    sealJson(summaries[0], encryption),
    sealJson(summaries[1], encryption),
    sealJson(summaries[2], encryption),
  ]);

  const ids = {
    source: 'seed-income-source',
    paycheck: 'seed-income-paycheck',
    bonus: 'seed-income-bonus',
    firstChange: 'seed-change-paycheck',
    secondChange: 'seed-change-bonus',
    freelance: 'seed-income-freelance',
    thirdChange: 'seed-change-freelance',
  };
  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.source}`),
    header(ids.source, 'source', null, addedAt),
  );
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.paycheck}`),
    header(ids.paycheck, 'payLine', ids.source, addedAt),
  );
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.bonus}`),
    header(ids.bonus, 'payLine', ids.source, addedAt + DAY_MS),
  );
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.freelance}`),
    header(ids.freelance, 'payLine', ids.source, addedAt + 2 * DAY_MS),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-source`),
    version(
      'seed-version-source',
      ids.source,
      'source',
      addedAt,
      firstPayday,
      ids.firstChange,
      sourceSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-paycheck`),
    version(
      'seed-version-paycheck',
      ids.paycheck,
      'payLine',
      addedAt,
      firstPayday,
      ids.firstChange,
      paycheckSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-bonus`),
    version(
      'seed-version-bonus',
      ids.bonus,
      'payLine',
      addedAt + DAY_MS,
      bonusDay,
      ids.secondChange,
      bonusSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-freelance`),
    version(
      'seed-version-freelance',
      ids.freelance,
      'payLine',
      addedAt + 2 * DAY_MS,
      freelanceDay,
      ids.thirdChange,
      freelanceSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/${ids.firstChange}`),
    change(
      ids.firstChange,
      addedAt,
      firstPayday,
      [ids.source, ids.paycheck],
      firstChange,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/${ids.secondChange}`),
    change(
      ids.secondChange,
      addedAt + DAY_MS,
      bonusDay,
      [ids.bonus],
      secondChange,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/${ids.thirdChange}`),
    change(
      ids.thirdChange,
      addedAt + 2 * DAY_MS,
      freelanceDay,
      [ids.freelance],
      thirdChange,
    ),
  );
  const override: DayOverrideSealed = {
    pairings: null,
    holdResolutions: { 'seed-envelope-trip': 'leaveShort' },
    payloads: {},
    billCents: {},
  };
  const bonusDayId = toDayKey(ids.bonus, bonusDay);
  const overrideDoc: IncomeDayDoc = {
    id: bonusDayId,
    payLineId: ids.bonus,
    sourceId: ids.source,
    expectedOn: bonusDay,
    arrivedOn: null,
    status: 'draft',
    createdAt: addedAt + 3 * DAY_MS,
    confirmedAt: null,
    doneLineIds: [],
    sealed: await sealJson(override, encryption),
  };
  batch.set(context.firestore.doc(`${plan}/days/${bonusDayId}`), overrideDoc);
  const pastDays = await writeSeedConfirmedDays(
    context,
    plan,
    ids,
    encryption,
    batch,
    {
      addedAt,
      today,
    },
    extraBillLine,
  );
  await batch.commit();
  return 12 + pastDays;
}

export const seedLine = (
  dayId: string,
  itemId: string,
  name: string,
  emoji: string | null,
  tier: RecordLine['tier'],
  cents: number,
): RecordLine => ({
  lineId: `${dayId}:${itemId}`,
  itemId,
  name,
  emoji,
  tier,
  demandCents: cents,
  cents,
  shortBy: 0,
  paidBy: [{ dayId, cents }],
  costId: null,
  costName: null,
  repaysFree: false,
});

/** Two paydays that already arrived, sealed the way a confirmation seals them: one as expected, one with more than expected and a note. The first funds the emergency cushion, so that goal starts partly held. */
async function writeSeedConfirmedDays(
  context: SeedContext,
  plan: string,
  ids: { source: string; paycheck: string },
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
  when: { addedAt: number; today: number },
  extraBillLine: ExtraBillLine | null,
) {
  const days = [
    {
      on: when.today - 11 * DAY_MS,
      arrivedCents: 214_000,
      note: null,
      withCushion: true,
      withBills: true,
      withCost: true,
    },
    {
      on: when.today - 25 * DAY_MS,
      arrivedCents: 226_000,
      note: 'Overtime',
      withCushion: false,
      withBills: false,
      withCost: false,
    },
    {
      on: when.today - 39 * DAY_MS,
      arrivedCents: 224_000,
      note: 'Bonus from the quarter',
      withCushion: false,
      withBills: false,
      withCost: false,
      edits: {
        'seed-envelope-groceries': 12_000,
        'seed-goal-vacation': 40_000,
      },
      lineNotes: {
        'seed-goal-vacation': 'Sent the bonus to the trip',
      } as Record<string, string | null>,
      correction: {
        edits: { 'seed-goal-vacation': 30_000 },
        note: 'Only $300 went to the trip',
      },
    },
  ];
  const docs = await Promise.all(
    days.map(async (entry) => {
      const { on, arrivedCents, note, withCushion, withBills, withCost } =
        entry;
      const byLine = (
        values: Record<string, never> | Record<string, number | string | null>,
      ) =>
        Object.fromEntries(
          Object.entries(values).map(([itemId, value]) => [
            `${dayId}:${itemId}`,
            value,
          ]),
        );
      const dayId = toDayKey(ids.paycheck, on);
      const lines = [
        seedLine(
          dayId,
          'seed-envelope-groceries',
          'Groceries',
          '🛒',
          'must',
          15_000,
        ),
        ...(withCushion
          ? [
              seedLine(
                dayId,
                'seed-goal-cushion',
                'Emergency cushion',
                null,
                'should',
                15_000,
              ),
              seedLine(
                dayId,
                KEPT_ENVELOPE_ID,
                'Concert tickets',
                '🎫',
                'want',
                6_000,
              ),
            ]
          : []),
        ...(withCost
          ? [
              {
                ...seedLine(
                  dayId,
                  'seed-horizon-surgery',
                  "Miso's surgery",
                  '🐱',
                  'must',
                  5_000,
                ),
                lineId: getCostLineId(
                  dayId,
                  'seed-horizon-surgery',
                  'seed-cost-surgery',
                ),
                costId: 'seed-cost-surgery',
                costName: 'Surgery',
                repaysFree: false,
              },
            ]
          : []),
        seedLine(
          dayId,
          'seed-goal-vacation',
          'Vacation fund',
          '🏖️',
          'want',
          30_000,
        ),
        ...(withBills
          ? [
              seedLine(dayId, 'seed-bill-rent', 'Rent', '🏠', 'must', 62_500),
              seedLine(
                dayId,
                'seed-bill-car',
                'Car registration',
                null,
                'must',
                18_500,
              ),
              seedLine(
                dayId,
                'seed-bill-laptop',
                'Laptop payment plan',
                null,
                'should',
                5_000,
              ),
              ...(extraBillLine
                ? [
                    seedLine(
                      dayId,
                      extraBillLine.itemId,
                      extraBillLine.name,
                      extraBillLine.emoji,
                      extraBillLine.tier,
                      extraBillLine.cents,
                    ),
                  ]
                : []),
            ]
          : []),
      ];
      const funded = lines.reduce((sum, line) => sum + line.cents, 0);
      const proposed: ProposedSealed = {
        fingerprint: 'seed',
        stance: 'conservative',
        expectedCents: 214_000,
        freeToSpendCents: 214_000 - funded,
        lines,
      };
      const confirmedLines = applyLineEdits(
        lines,
        byLine(entry.edits ?? {}) as Record<string, number>,
        dayId,
      );
      const confirmed: ConfirmedSealed = {
        fingerprint: 'seed',
        stance: 'conservative',
        arrivedCents,
        expectedCents: 214_000,
        freeToSpendCents: getRemainder(arrivedCents, confirmedLines),
        lines: confirmedLines,
        differences: [
          ...(arrivedCents === 214_000
            ? []
            : [
                {
                  kind: 'amount' as const,
                  plannedCents: 214_000,
                  actualCents: arrivedCents,
                  note,
                },
              ]),
          ...getLineDifferences(
            lines,
            confirmedLines,
            byLine(entry.lineNotes ?? {}) as Record<string, string | null>,
          ),
        ],
      };
      const correction = entry.correction
        ? buildCorrection({
            base: {
              recordId: `${dayId}_confirmed`,
              dayId,
              kind: 'confirmed',
              stance: 'conservative',
              arrivedCents,
              freeToSpendCents: confirmed.freeToSpendCents,
              lines: confirmedLines,
            },
            arrivedCents,
            edits: byLine(entry.correction.edits) as Record<string, number>,
            note: entry.correction.note,
          })
        : null;
      return {
        dayId,
        on,
        arrivedCents,
        sealedCorrection: correction
          ? await sealJson(correction, encryption)
          : null,
        doneLineIds: withBills ? [`${dayId}:seed-bill-laptop`] : [],
        sealedDay: await sealJson(EMPTY_SEED_OVERRIDE, encryption),
        sealedProposed: await sealJson(proposed, encryption),
        sealedConfirmed: await sealJson(confirmed, encryption),
      };
    }),
  );
  docs.forEach((entry) => {
    const confirmedAt = entry.on + 9 * 3_600_000;
    const day: IncomeDayDoc = {
      id: entry.dayId,
      payLineId: ids.paycheck,
      sourceId: ids.source,
      expectedOn: entry.on,
      arrivedOn: entry.on,
      status: 'confirmed',
      createdAt: confirmedAt,
      confirmedAt,
      doneLineIds: entry.doneLineIds,
      sealed: entry.sealedDay,
    };
    batch.set(context.firestore.doc(`${plan}/days/${entry.dayId}`), day);
    (['proposed', 'confirmed'] as const).forEach((kind) =>
      batch.set(
        context.firestore.doc(
          `${plan}/days/${entry.dayId}/records/${entry.dayId}_${kind}`,
        ),
        {
          id: `${entry.dayId}_${kind}`,
          dayId: entry.dayId,
          kind,
          createdAt: confirmedAt,
          sealed:
            kind === 'proposed' ? entry.sealedProposed : entry.sealedConfirmed,
          supersedesId: null,
        },
      ),
    );
    if (entry.sealedCorrection) {
      const id = getCorrectionId(`${entry.dayId}_confirmed`);
      batch.set(
        context.firestore.doc(`${plan}/days/${entry.dayId}/records/${id}`),
        {
          id,
          dayId: entry.dayId,
          kind: 'correction',
          createdAt: confirmedAt + 2 * DAY_MS,
          sealed: entry.sealedCorrection,
          supersedesId: `${entry.dayId}_confirmed`,
        },
      );
    }
  });
  const paidAhead = await writeSeedPaidAhead(
    context,
    plan,
    encryption,
    batch,
    when.today,
  );
  return (
    docs.length * 3 +
    docs.filter((entry) => entry.sealedCorrection).length +
    paidAhead
  );
}

/** The laptop plan's next payment, marked paid ahead of its due date: $50.00 of it was set aside by the confirmed day, so $39.00 came from Free to Spend (planned at the bill's own optimistic end, $89.00). */
async function writeSeedPaidAhead(
  context: SeedContext,
  plan: string,
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
  today: number,
) {
  const now = new Date(today);
  const dueOn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15);
  const id = getPaidMoveId('seed-bill-laptop', dueOn, 0);
  const payload: BillPaidSealed = {
    amountCents: 8_900,
    paidOn: today - 2 * DAY_MS,
    fromFreeCents: 3_900,
  };
  const move: MoveDoc = {
    id,
    kind: 'billPaid',
    date: dueOn,
    refId: 'seed-bill-laptop',
    reversesMoveId: null,
    createdAt: today - 2 * DAY_MS + 10 * 3_600_000,
    sealed: await sealJson(payload, encryption),
  };
  batch.set(context.firestore.doc(`${plan}/moves/${id}`), move);
  return 1;
}

const EMPTY_SEED_OVERRIDE: DayOverrideSealed = {
  pairings: null,
  holdResolutions: {},
  payloads: {},
  billCents: {},
};

/** Seven envelopes across Must, Should and Want, all three cadences, a percentage of the day and the rest, sealed the way the app seals them. */
async function writeSeedEnvelopes(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  hasWeekly = false,
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 12 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const paydayKey = (index: number) =>
    toDayKey('seed-income-paycheck', firstPayday + index * 14 * DAY_MS);
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });

  const envelopes: { id: string; payload: EnvelopeSealed }[] = [
    {
      id: 'seed-envelope-groceries',
      payload: {
        name: 'Groceries',
        emoji: '🛒',
        priority: 'must',
        orderIndex: 1,
        groupId: 'seed-group-home',
        maxCents: null,
        spillTo: [],
        funding: { amount: exact(15_000), cadence: { kind: 'everyIncomeDay' } },
        extras: [{ tier: 'want', cents: 5_000, orderIndex: 9 }],
      },
    },
    {
      id: 'seed-envelope-gas',
      payload: {
        name: 'Gas',
        emoji: null,
        priority: 'must',
        orderIndex: 2,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: {
          amount: exact(6_000),
          cadence: { kind: 'everyNth', n: 2, anchorDayKey: paydayKey(0) },
        },
      },
    },
    {
      id: 'seed-envelope-dining',
      payload: {
        name: 'Dining out',
        emoji: '🍜',
        priority: 'should',
        orderIndex: 1,
        groupId: null,
        maxCents: null,
        spillTo: ['seed-envelope-everyday', 'seed-envelope-gifts'],
        funding: { amount: exact(5_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-envelope-gifts',
      payload: {
        name: 'Birthday and holiday gifts',
        emoji: '🎁',
        priority: 'should',
        orderIndex: 2,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: {
          amount: exact(4_000),
          cadence: { kind: 'everyNth', n: 3, anchorDayKey: paydayKey(0) },
        },
      },
    },
    {
      id: 'seed-envelope-trip',
      payload: {
        name: 'Weekend away',
        emoji: null,
        priority: 'want',
        orderIndex: 1,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: {
          amount: exact(20_000),
          cadence: {
            kind: 'chosen',
            dayKeys: [paydayKey(0), paydayKey(2), paydayKey(4)],
          },
        },
      },
    },
    {
      id: 'seed-envelope-savings',
      payload: {
        name: 'Savings',
        emoji: '💰',
        priority: 'should',
        orderIndex: 3,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: {
          amount: { kind: 'percent', bps: 1_000, of: 'dayMoney' },
          cadence: { kind: 'everyIncomeDay' },
        },
      },
    },
    {
      id: 'seed-envelope-everyday',
      payload: {
        name: 'Everyday spending',
        emoji: null,
        priority: 'want',
        orderIndex: 2,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: {
          amount: { kind: 'rest' },
          cadence: { kind: 'everyNth', n: 2, anchorDayKey: paydayKey(0) },
        },
      },
    },
    {
      id: 'seed-envelope-phone-internet',
      payload: {
        name: 'Phone and internet',
        emoji: '📶',
        priority: 'must',
        orderIndex: 3,
        groupId: null,
        maxCents: null,
        spillTo: [],
        funding: {
          amount: exact(9_500),
          cadence: {
            kind: 'calendar',
            period: 'monthly',
            startsOn: today - 3 * DAY_MS,
          },
        },
      },
    },
    ...(hasWeekly
      ? [
          {
            id: 'seed-envelope-coffee',
            payload: {
              name: 'Coffee',
              emoji: '☕',
              priority: 'want' as const,
              orderIndex: 3,
              groupId: null,
              maxCents: null,
              spillTo: [],
              funding: {
                amount: exact(2_000),
                cadence: {
                  kind: 'calendar' as const,
                  period: 'weekly' as const,
                  startsOn: today - 3 * DAY_MS,
                },
              },
            },
          },
        ]
      : []),
  ];

  const sealedChanges = await Promise.all(
    envelopes.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const sealedEnvelopes = await Promise.all(
    envelopes.map(({ payload }) => sealJson(payload, encryption)),
  );

  const batch = context.firestore.batch();
  envelopes.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'envelope', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'envelope',
        createdAt,
        today,
        changeId,
        sealedEnvelopes[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedChanges[index]),
    );
  });
  await batch.commit();
  return envelopes.length * 3;
}

/** Eight bills and two groups: rent that repeats monthly and goes up from a date two months ahead, a one-time bill, a bill chosen across three paydays and a bill that ends after six payments, and Home (rent, water, building fees) and Subscriptions (streaming, music) to group them. */
async function writeSeedBills(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 11 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const paydayKey = (index: number) =>
    toDayKey('seed-income-paycheck', firstPayday + index * 14 * DAY_MS);
  const exact = (cents: number) => ({ lowCents: cents, highCents: cents });
  const never = { onDate: null, afterCount: null };
  const dayOfNextMonth = (day: number) => {
    const now = new Date(today);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day);
  };

  const monthly = (
    id: string,
    name: string,
    emoji: string | null,
    priority: BillSealed['priority'],
    orderIndex: number,
    cents: number,
    day: number,
    groupId: string,
  ): { id: string; payload: BillSealed } => ({
    id,
    payload: {
      name,
      emoji,
      priority,
      orderIndex,
      amount: exact(cents),
      timing: {
        kind: 'date',
        schedule: {
          kind: 'monthly',
          anchor: dayOfNextMonth(day),
          monthDays: [day],
        },
      },
      ending: never,
      fundedBy: { kind: 'suggested' },
      stanceOverride: null,
      groupId,
    },
  });

  const bills: { id: string; payload: BillSealed }[] = [
    {
      id: 'seed-bill-rent',
      payload: {
        name: 'Rent',
        emoji: '🏠',
        priority: 'must',
        orderIndex: 1,
        amount: exact(125_000),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'monthly',
            anchor: dayOfNextMonth(1),
            monthDays: [1],
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
        stanceOverride: null,
        groupId: 'seed-group-home',
      },
    },
    {
      id: 'seed-bill-car',
      payload: {
        name: 'Car registration',
        emoji: null,
        priority: 'must',
        orderIndex: 2,
        amount: exact(18_500),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'once',
            anchor: today + 40 * DAY_MS,
            monthDays: [],
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
        stanceOverride: null,
        groupId: null,
        paidByCardId: SEED_CHASE_CARD,
      },
    },
    {
      id: 'seed-bill-dentist',
      payload: {
        name: 'Dentist',
        emoji: '🦷',
        priority: 'should',
        orderIndex: 1,
        amount: { lowCents: 30_000, highCents: 36_000 },
        timing: {
          kind: 'date',
          schedule: {
            kind: 'once',
            anchor: today + 36 * DAY_MS,
            monthDays: [],
          },
        },
        ending: never,
        fundedBy: {
          kind: 'chosen',
          dayKeys: [paydayKey(0), paydayKey(1), paydayKey(2)],
        },
        stanceOverride: null,
        groupId: null,
      },
    },
    {
      id: 'seed-bill-laptop',
      payload: {
        name: 'Laptop payment plan',
        emoji: null,
        priority: 'should',
        orderIndex: 2,
        amount: { lowCents: 8_900, highCents: 9_900 },
        timing: {
          kind: 'date',
          schedule: {
            kind: 'monthly',
            anchor: dayOfNextMonth(15),
            monthDays: [15],
          },
        },
        ending: { onDate: null, afterCount: 6 },
        fundedBy: { kind: 'suggested' },
        stanceOverride: 'optimistic',
        groupId: null,
      },
    },
    {
      id: 'seed-bill-car-insurance',
      payload: {
        name: 'Car insurance',
        emoji: '🚗',
        priority: 'must',
        orderIndex: 5,
        amount: exact(72_000),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'everyMonths',
            anchor: today + 75 * DAY_MS,
            monthDays: [],
            intervalMonths: 6,
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
        stanceOverride: null,
        groupId: null,
      },
    },
    {
      id: 'seed-bill-passport',
      payload: {
        name: 'Passport renewal',
        emoji: null,
        priority: 'should',
        orderIndex: 3,
        amount: exact(16_500),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'everyMonths',
            anchor: today + 500 * DAY_MS,
            monthDays: [],
            intervalMonths: 24,
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
        stanceOverride: null,
        groupId: null,
      },
    },
    monthly(
      'seed-bill-water',
      'Water',
      '💧',
      'must',
      3,
      6_500,
      12,
      'seed-group-home',
    ),
    monthly(
      'seed-bill-fees',
      'Building fees',
      null,
      'must',
      4,
      8_500,
      3,
      'seed-group-home',
    ),
    monthly(
      'seed-bill-streaming',
      'Streaming',
      null,
      'want',
      1,
      1_599,
      20,
      'seed-group-subscriptions',
    ),
    monthly(
      'seed-bill-music',
      'Music',
      '🎧',
      'want',
      2,
      1_199,
      22,
      'seed-group-subscriptions',
    ),
    ...(
      [
        ['seed-bill-gym', 'Gym', 4_900],
        ['seed-bill-renters', "Renter's insurance", 1_800],
      ] as const
    ).map(([id, name, cents], index) => ({
      id,
      payload: {
        name,
        emoji: null,
        priority: 'should' as const,
        orderIndex: 10 + index,
        amount: exact(cents),
        timing: {
          kind: 'date' as const,
          schedule: { kind: 'monthly' as const, anchor: null, monthDays: [] },
        },
        ending: never,
        fundedBy: { kind: 'suggested' as const },
        stanceOverride: null,
        groupId: null,
      },
    })),
  ];
  const groups: { id: string; payload: GroupSealed }[] = [
    {
      id: 'seed-group-home',
      payload: {
        name: 'Home',
        startingPriority: 'must',
        envelopePriority: 'must',
        goalPriority: 'should',
        emoji: '🏠',
      },
    },
    {
      id: 'seed-group-subscriptions',
      payload: {
        name: 'Subscriptions',
        startingPriority: 'want',
        envelopePriority: 'want',
        goalPriority: null,
        emoji: null,
      },
    },
  ];

  const sealedChanges = await Promise.all(
    bills.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const sealedBills = await Promise.all(
    bills.map(({ payload }) => sealJson(payload, encryption)),
  );

  const sealedGroups = await Promise.all(
    groups.map(({ payload }) => sealJson(payload, encryption)),
  );
  const sealedGroupChanges = await Promise.all(
    groups.map(({ payload }) =>
      sealJson(
        { summary: `Added the group ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );

  const batch = context.firestore.batch();
  groups.forEach(({ id }, index) => {
    const createdAt = addedAt - 1000 + index;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'group', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'group',
        createdAt,
        today,
        changeId,
        sealedGroups[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedGroupChanges[index]),
    );
  });
  bills.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'bill', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'bill',
        createdAt,
        today,
        changeId,
        sealedBills[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedChanges[index]),
    );
  });
  const raise = {
    ...bills[0].payload,
    amount: exact(130_000),
  } satisfies BillSealed;
  const raiseFromStart = Date.UTC(
    new Date(today).getUTCFullYear(),
    new Date(today).getUTCMonth() + 2,
    1,
  );
  const raiseText = formatDateOrdinalUTC(raiseFromStart);
  const [raiseSealed, raiseChangeSealed] = await Promise.all([
    sealJson(raise, encryption),
    sealJson(
      {
        summary: `Rent: Amount $1,250.00 to $1,300.00, from ${raiseText}.`,
        note: 'Lease renewal',
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  const raiseCreatedAt = context.now - 2 * DAY_MS;
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-rent-raise`),
    version(
      'seed-version-rent-raise',
      'seed-bill-rent',
      'bill',
      raiseCreatedAt,
      raiseFromStart,
      'seed-change-rent-raise',
      raiseSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-rent-raise`),
    change(
      'seed-change-rent-raise',
      raiseCreatedAt,
      raiseFromStart,
      ['seed-bill-rent'],
      raiseChangeSealed,
    ),
  );
  await batch.commit();
  return (bills.length + groups.length) * 3 + 2;
}

const SEED_TAYLOR_CARD = 'seed-card-taylor-citi';

type ExtraBillLine = Pick<RecordLine, 'itemId' | 'name' | 'emoji' | 'tier'> & {
  cents: number;
};

/** Jamie's cloud storage, which pays itself on the Venture X; their last payday set its next payment aside in full. */
const JAMIE_CLOUD_LINE: ExtraBillLine = {
  itemId: 'seed-bill-jamie-cloud',
  name: 'Cloud storage',
  emoji: '☁️',
  tier: 'want',
  cents: 999,
};

interface SelfPayingBill {
  id: string;
  payload: BillSealed;
  /** The payment the app already marked paid by itself, with what it marked. */
  mark: { dueOn: number; amountCents: number; isEstimate: boolean } | null;
}

/**
 * Bills that pay themselves (Track and up). Taylor (Track): a card for Streaming, which marked itself paid, and Electric ($60 to $90),
 * marked at the top of its range and waiting for what it really charged, beside Phone, due today and paid by hand. Jamie (Link): Phone on
 * the Venture X, left unmarked since Link waits for its charge, beside three card charges near its due day, so it asks which charge
 * it was, and Cloud storage, which their last payday set aside in full.
 */
async function writeSeedSelfPaying(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  who: 'track' | 'link',
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - (who === 'track' ? 12 : 11) * DAY_MS;
  const dayOf = (offset: number) =>
    new Date(today + offset * DAY_MS).getUTCDate();
  const monthlyOn = (dueOn: number) => ({
    kind: 'date' as const,
    schedule: {
      kind: 'monthly' as const,
      anchor: dueOn,
      monthDays: [new Date(dueOn).getUTCDate()],
    },
  });
  const base = {
    ending: { onDate: null, afterCount: null },
    fundedBy: { kind: 'suggested' as const },
    stanceOverride: null,
    groupId: null,
    accountId: null,
    paysItself: true,
  };
  const streamingDue = today - 4 * DAY_MS;
  const electricDue = today - 6 * DAY_MS;
  const phoneDue = today - 5 * DAY_MS;
  const bills: SelfPayingBill[] =
    who === 'track'
      ? [
          {
            id: 'seed-bill-taylor-streaming',
            payload: {
              ...base,
              name: 'Streaming',
              emoji: '📺',
              priority: 'want',
              orderIndex: 1,
              amount: { lowCents: 1_549, highCents: 1_549 },
              timing: monthlyOn(streamingDue),
              paidByCardId: SEED_TAYLOR_CARD,
            },
            mark: {
              dueOn: streamingDue,
              amountCents: 1_549,
              isEstimate: false,
            },
          },
          {
            id: 'seed-bill-taylor-electric',
            payload: {
              ...base,
              name: 'Electric',
              emoji: '⚡',
              priority: 'must',
              orderIndex: 1,
              amount: { lowCents: 6_000, highCents: 9_000 },
              timing: monthlyOn(electricDue),
              paidByCardId: null,
            },
            mark: { dueOn: electricDue, amountCents: 9_000, isEstimate: true },
          },
          {
            id: 'seed-bill-taylor-phone',
            payload: {
              ...base,
              name: 'Phone',
              emoji: null,
              priority: 'must',
              orderIndex: 2,
              amount: { lowCents: 4_000, highCents: 4_000 },
              timing: monthlyOn(today),
              paidByCardId: null,
              paysItself: null,
            },
            mark: null,
          },
        ]
      : [
          {
            id: 'seed-bill-jamie-phone',
            payload: {
              ...base,
              name: 'Phone',
              emoji: '📱',
              priority: 'must',
              orderIndex: 6,
              amount: { lowCents: 4_500, highCents: 4_500 },
              timing: monthlyOn(phoneDue),
              groupId: 'seed-group-home',
              paidByCardId: SEED_VENTURE_CARD,
            },
            mark: null,
          },
          {
            id: JAMIE_CLOUD_LINE.itemId,
            payload: {
              ...base,
              name: JAMIE_CLOUD_LINE.name,
              emoji: JAMIE_CLOUD_LINE.emoji,
              priority: JAMIE_CLOUD_LINE.tier,
              orderIndex: 3,
              amount: {
                lowCents: JAMIE_CLOUD_LINE.cents,
                highCents: JAMIE_CLOUD_LINE.cents,
              },
              timing: monthlyOn(today + 11 * DAY_MS),
              groupId: 'seed-group-subscriptions',
              paidByCardId: SEED_VENTURE_CARD,
            },
            mark: null,
          },
        ];

  const batch = context.firestore.batch();
  if (who === 'track') {
    batch.set(context.firestore.doc(`${plan}/cards/${SEED_TAYLOR_CARD}`), {
      id: SEED_TAYLOR_CARD,
      createdAt: addedAt - 60_000,
      updatedAt: addedAt - 60_000,
      archivedAt: null,
      linkId: null,
      sealed: await sealJson(
        {
          issuer: 'Citi',
          name: 'Double Cash',
          dueDay: dayOf(16),
          lastFour: '2208',
        } satisfies CardSealed,
        encryption,
      ),
    } satisfies CardDoc);
  }
  await Promise.all(
    bills.map(async ({ id, payload, mark }, index) => {
      const createdAt = addedAt + index * 1000;
      const changeId = `seed-change-${id}`;
      batch.set(
        context.firestore.doc(`${plan}/items/${id}`),
        header(id, 'bill', null, createdAt),
      );
      batch.set(
        context.firestore.doc(`${plan}/versions/seed-version-${id}`),
        version(
          `seed-version-${id}`,
          id,
          'bill',
          createdAt,
          startOfUtcDay(createdAt),
          changeId,
          await sealJson(payload, encryption),
        ),
      );
      batch.set(
        context.firestore.doc(`${plan}/changes/${changeId}`),
        change(
          changeId,
          createdAt,
          startOfUtcDay(createdAt),
          [id],
          await sealJson(
            { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
            encryption,
          ),
        ),
      );
      if (!mark) return;
      const moveId = getPaidMoveId(id, mark.dueOn, 0);
      const markedAt = mark.dueOn + 9 * 3_600_000;
      const cardId = payload.paidByCardId ?? null;
      const paid = {
        amountCents: mark.amountCents,
        paidOn: mark.dueOn,
        fromFreeCents: mark.amountCents,
        cardId,
        auto: { isEstimate: mark.isEstimate, purchaseId: null },
      } satisfies BillPaidSealed;
      batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
        id: moveId,
        kind: 'billPaid',
        date: mark.dueOn,
        refId: id,
        reversesMoveId: null,
        createdAt: markedAt,
        sealed: await sealJson(paid, encryption),
      } satisfies MoveDoc);
      const due = formatDateOrdinalUTC(mark.dueOn);
      const undoText = PAID_HISTORY_WORDS.undoText(payload.name, due);
      batch.set(
        context.firestore.doc(`${plan}/changes/seed-change-${moveId}`),
        {
          id: `seed-change-${moveId}`,
          kind: 'paymentChange',
          createdAt: markedAt,
          effectiveFrom: null,
          itemIds: [id],
          sealed: await sealJson(
            {
              summary: AUTO_PAY_WORDS.autoSummary(
                payload.name,
                due,
                formatCents(mark.amountCents),
              ),
              note: null,
              move: {
                moveId,
                date: mark.dueOn,
                fromId: null,
                toId: null,
                cents: mark.amountCents,
                note: null,
                isOutside: false,
                undoText,
                isUndo: false,
                bill: {
                  billId: id,
                  name: payload.name,
                  dueOn: mark.dueOn,
                  paidOn: mark.dueOn,
                  amountCents: mark.amountCents,
                  fromFreeCents: mark.amountCents,
                  cardId,
                },
              },
            } satisfies ChangeSealed,
            encryption,
          ),
        } satisfies ChangeDoc,
      );
    }),
  );
  const charges =
    who === 'link'
      ? [
          {
            id: 'seed-link-purchase-mint',
            offset: 0,
            merchant: 'Mint Mobile',
            cents: 4_500,
          },
          {
            id: 'seed-link-purchase-uber',
            offset: -1,
            merchant: 'Uber',
            cents: 4_310,
          },
          {
            id: 'seed-link-purchase-traderjoes',
            offset: 1,
            merchant: "Trader Joe's",
            cents: 4_782,
          },
        ]
      : [];
  await Promise.all(
    charges.map(async (entry) => {
      const date = phoneDue + entry.offset * DAY_MS;
      const createdAt = date + 12 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/purchases/${entry.id}`), {
        id: entry.id,
        date,
        source: 'link',
        status: 'posted',
        needsHome: true,
        accountId: null,
        expenseId: null,
        dedupeKey: `${entry.id}-dedupe`,
        createdAt,
        updatedAt: createdAt,
        sealed: await sealJson(
          {
            amountCents: entry.cents,
            merchant: entry.merchant,
            label: null,
            note: null,
            lines: [{ envelopeId: null, cents: entry.cents, via: 'free' }],
            refundOfId: null,
            paidByCardId: SEED_VENTURE_CARD,
            link: null,
            receiptText: null,
            costRef: null,
            billRef: null,
            notSameAs: null,
            incomeDayId: null,
            assignedBy: null,
            pairedWithId: null,
            pairKind: null,
            cardPaymentMoveId: null,
            tickedDayKey: null,
            category: null,
            ruleId: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      } satisfies PurchaseDoc);
    }),
  );
  await batch.commit();
  const marks = bills.filter(({ mark }) => mark !== null).length;
  return (
    (who === 'track' ? 1 : 0) + bills.length * 3 + marks * 2 + charges.length
  );
}

/** Goals with and without a date: one lands exactly on pace, one the plan fills on the first income day, and one whose income days can't reach it by its date. */
async function writeSeedGoals(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 10 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const paydayKey = (index: number) =>
    toDayKey('seed-income-paycheck', firstPayday + index * 14 * DAY_MS);
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });

  const goals: { id: string; payload: GoalSealed }[] = [
    {
      id: 'seed-goal-vacation',
      payload: {
        name: 'Vacation fund',
        emoji: '🏖️',
        priority: 'want',
        orderIndex: 1,
        targetCents: 180_000,
        targetDate: today + 50 * DAY_MS,
        state: 'active',
        groupId: null,
        funding: { amount: exact(30_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-goal-cushion',
      payload: {
        name: 'Emergency cushion',
        emoji: null,
        priority: 'should',
        orderIndex: 1,
        targetCents: 60_000,
        targetDate: null,
        state: 'active',
        groupId: null,
        funding: {
          amount: exact(15_000),
          cadence: { kind: 'everyNth', n: 2, anchorDayKey: paydayKey(0) },
        },
        extras: [{ tier: 'want', cents: 10_000, orderIndex: 9 }],
      },
    },
    {
      id: 'seed-goal-phone',
      payload: {
        name: 'New phone',
        emoji: '📱',
        priority: 'should',
        orderIndex: 2,
        targetCents: 20_000,
        targetDate: today + 30 * DAY_MS,
        state: 'active',
        groupId: null,
        funding: { amount: exact(20_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-goal-repairs',
      payload: {
        name: 'Home repairs',
        emoji: null,
        priority: 'should',
        orderIndex: 3,
        targetCents: 200_000,
        targetDate: null,
        state: 'active',
        groupId: 'seed-group-home',
        funding: {
          amount: { kind: 'percent', bps: 500, of: 'dayMoney' },
          cadence: { kind: 'everyIncomeDay' },
        },
      },
    },
    {
      id: 'seed-goal-house',
      payload: {
        name: 'House down payment',
        emoji: '🏡',
        priority: 'want',
        orderIndex: 2,
        targetCents: 1_500_000,
        targetDate: null,
        funding: { amount: exact(0), cadence: { kind: 'none' } },
        state: 'active',
        groupId: null,
      },
    },
    {
      id: 'seed-goal-concert',
      payload: {
        name: 'Concert tickets',
        emoji: '🎟️',
        priority: 'want',
        orderIndex: 3,
        targetCents: 60_000,
        targetDate: today + 20 * DAY_MS,
        state: 'active',
        groupId: null,
        funding: { amount: exact(10_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-goal-wedding',
      payload: {
        name: 'Wedding gift',
        emoji: '🎁',
        priority: 'want',
        orderIndex: 4,
        targetCents: 40_000,
        targetDate: nextCalendarDay(today, 11, 19) + 42 * DAY_MS,
        state: 'active',
        groupId: null,
        funding: { amount: exact(5_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
  ];

  const sealedChanges = await Promise.all(
    goals.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const sealedGoals = await Promise.all(
    goals.map(({ payload }) => sealJson(payload, encryption)),
  );

  const batch = context.firestore.batch();
  goals.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'goal', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'goal',
        createdAt,
        today,
        changeId,
        sealedGoals[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedChanges[index]),
    );
  });
  await batch.commit();
  return goals.length * 3;
}

/** Jamie's plan is already at Link (Track, with the open period linked from 14 days ago): income, envelopes, bills and goals like Alex's, a starting point 45 days back that is also the day tracking began, what each envelope held that day, and the two records of the move up. Jamie's `trackingPeriods` has one open period. */
async function seedTrackingPlan(
  context: SeedContext,
  keyring: ReturnType<typeof readKeyring>,
) {
  const owner = FIXTURE_USERS.partnerTwo;
  const data = deriveSeedDataKey(keyring, owner.uid);
  const createdAt = context.now - 14 * DAY_MS;
  const startDate = startOfUtcDay(context.now) - 45 * DAY_MS;
  const encryption = {
    appId: 'runway' as const,
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const plan = `apps/runway/plans/${owner.uid}`;

  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`apps/runway/server/${owner.uid}/keys/data`),
    wrapDataKey(keyring, owner.uid, data, createdAt),
  );
  batch.set(context.firestore.doc(plan), {
    uid: owner.uid,
    createdAt,
    updatedAt: createdAt,
    stance: 'conservative',
    startDate,
    trackingPeriods: [
      { from: startDate, to: null, linkedFrom: startOfUtcDay(createdAt) },
    ],
    dirtyFrom: null,
    notify: { needsHome: false },
    sorting: null,
    keyId: data.keyId,
    sealed: await sealJson({ currencyCode: DEFAULT_CURRENCY_CODE }, encryption),
  });
  const moveId = `tracking_${new Date(startDate).toISOString().slice(0, 10).replaceAll('-', '')}_${createdAt}`;
  batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
    id: moveId,
    kind: 'trackingChange',
    date: startDate,
    refId: null,
    reversesMoveId: null,
    createdAt,
    sealed: await sealJson({ direction: 'up' }, encryption),
  } satisfies MoveDoc);
  const envelopeStarts = [
    ['seed-envelope-groceries', 40_000],
    ['seed-envelope-gas', 4_000],
    ['seed-envelope-dining', 2_000],
    ['seed-envelope-gifts', 5_000],
  ] as const;
  await Promise.all(
    envelopeStarts.map(async ([refId, cents]) => {
      const id = `start_${refId}_${createdAt}`;
      batch.set(context.firestore.doc(`${plan}/moves/${id}`), {
        id,
        kind: 'start',
        date: startDate,
        refId,
        reversesMoveId: null,
        createdAt,
        sealed: await sealJson(
          { amountCents: cents, holding: 'envelope' } satisfies StartSealed,
          encryption,
        ),
      } satisfies MoveDoc);
    }),
  );
  batch.set(context.firestore.doc(`${plan}/changes/seed-change-level-move`), {
    id: 'seed-change-level-move',
    kind: 'levelMove',
    createdAt,
    effectiveFrom: startDate,
    itemIds: [],
    sealed: await sealJson(
      {
        summary: `Started tracking from ${formatDateOrdinalUTC(startDate)}.`,
      } satisfies ChangeSealed,
      encryption,
    ),
  });
  await batch.commit();

  const documents = [
    await writeSeedIncome(
      context,
      owner.uid,
      encryption,
      'seed-account-checking-a',
      JAMIE_CLOUD_LINE,
    ),
    await writeSeedEnvelopes(context, owner.uid, encryption, true),
    await writeSeedBills(context, owner.uid, encryption),
    await writeSeedGoals(context, owner.uid, encryption),
    await writeSeedKeptEnvelope(context, owner.uid, encryption),
  ].reduce((sum, count) => sum + count, 0);
  const startBatch = context.firestore.batch();
  const startDocuments = await writeSeedStart(
    context,
    owner.uid,
    encryption,
    startBatch,
  );
  const cardDocuments = await writeSeedCards(
    context,
    owner.uid,
    encryption,
    startBatch,
  );
  const accountDocuments = await writeSeedAccounts(
    context,
    owner.uid,
    encryption,
    startBatch,
  );
  await startBatch.commit();
  const horizonDocuments = await writeSeedHorizon(
    context,
    owner.uid,
    encryption,
    true,
  );
  const purchaseDocuments = await writeSeedPurchases(
    context,
    owner.uid,
    encryption,
  );
  const selfPayingDocuments = await writeSeedSelfPaying(
    context,
    owner.uid,
    encryption,
    'link',
  );
  const closingDocuments = await seedClosings(
    context,
    owner.uid,
    encryption,
    startDate,
  );
  return (
    closingDocuments +
    2 +
    1 +
    envelopeStarts.length +
    1 +
    documents +
    startDocuments +
    cardDocuments +
    accountDocuments +
    horizonDocuments +
    purchaseDocuments +
    selfPayingDocuments
  );
}

/** Taylor's Runway plan: at Track after unlinking a bank (see SEEDING.md). */
async function seedUnlinkedPlan(
  context: SeedContext,
  keyring: ReturnType<typeof readKeyring>,
) {
  const owner = FIXTURE_USERS.nineLivesCaretaker;
  const data = deriveSeedDataKey(keyring, owner.uid);
  const today = startOfUtcDay(context.now);
  const createdAt = context.now - 30 * DAY_MS;
  const startDate = today - 30 * DAY_MS;
  const linkedAt = context.now - 10 * DAY_MS;
  const unlinkedAt = context.now - 3 * DAY_MS;
  const encryption = {
    appId: 'runway' as const,
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const plan = `apps/runway/plans/${owner.uid}`;
  const linkId = 'seed-link-taylor-capital-one';
  const accountId = 'seed-account-taylor-checking';

  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`apps/runway/server/${owner.uid}/keys/data`),
    wrapDataKey(keyring, owner.uid, data, createdAt),
  );
  batch.set(context.firestore.doc(plan), {
    uid: owner.uid,
    createdAt,
    updatedAt: unlinkedAt,
    stance: 'conservative',
    startDate,
    trackingPeriods: [{ from: startDate, to: null, linkedFrom: null }],
    notify: { needsHome: false },
    sorting: null,
    keyId: data.keyId,
    sealed: await sealJson({ currencyCode: DEFAULT_CURRENCY_CODE }, encryption),
  });
  const moveId = `tracking_${new Date(startDate).toISOString().slice(0, 10).replaceAll('-', '')}_${createdAt}`;
  batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
    id: moveId,
    kind: 'trackingChange',
    date: startDate,
    refId: null,
    reversesMoveId: null,
    createdAt,
    sealed: await sealJson({ direction: 'up' }, encryption),
  } satisfies MoveDoc);
  const envelopeStarts = [
    ['seed-envelope-groceries', 40_000],
    ['seed-envelope-gas', 4_000],
    ['seed-envelope-dining', 2_000],
    ['seed-envelope-gifts', 5_000],
  ] as const;
  await Promise.all(
    envelopeStarts.map(async ([refId, cents]) => {
      const id = `start_${refId}_${createdAt}`;
      batch.set(context.firestore.doc(`${plan}/moves/${id}`), {
        id,
        kind: 'start',
        date: startDate,
        refId,
        reversesMoveId: null,
        createdAt,
        sealed: await sealJson(
          { amountCents: cents, holding: 'envelope' } satisfies StartSealed,
          encryption,
        ),
      } satisfies MoveDoc);
    }),
  );
  const changes = [
    {
      id: 'seed-change-taylor-started',
      createdAt,
      effectiveFrom: startDate,
      summary: `Started tracking from ${formatDateOrdinalUTC(startDate)}.`,
    },
    {
      id: 'seed-change-taylor-linked',
      createdAt: linkedAt,
      effectiveFrom: null,
      summary: `Linked a bank from ${formatDateOrdinalUTC(startOfUtcDay(linkedAt))}.`,
    },
    {
      id: 'seed-change-taylor-unlinked',
      createdAt: unlinkedAt,
      effectiveFrom: null,
      summary: 'Unlinked Capital One; new purchases stop. What came in stays.',
    },
  ];
  await Promise.all(
    changes.map(async (entry) => {
      batch.set(context.firestore.doc(`${plan}/changes/${entry.id}`), {
        id: entry.id,
        kind: 'levelMove',
        createdAt: entry.createdAt,
        effectiveFrom: entry.effectiveFrom,
        itemIds: [],
        sealed: await sealJson(
          { summary: entry.summary } satisfies ChangeSealed,
          encryption,
        ),
      } satisfies ChangeDoc);
    }),
  );
  batch.set(context.firestore.doc(`${plan}/accounts/${accountId}`), {
    id: accountId,
    createdAt: linkedAt,
    updatedAt: linkedAt,
    archivedAt: null,
    linkId,
    sealed: await sealJson(
      {
        name: 'Checking',
        institution: 'Capital One',
        kind: 'checking',
        countedTowardTotal: true,
        isPullAccount: false,
        lastFour: '4821',
        balanceCents: 182_500,
        balanceOn: startOfUtcDay(unlinkedAt),
        holds: [],
        apyBps: null,
        interestDay: null,
      } satisfies AccountSealed,
      encryption,
    ),
  } satisfies AccountDoc);
  batch.set(context.firestore.doc(`${plan}/links/${linkId}`), {
    id: linkId,
    status: 'revoked',
    needsCardConsent: null,
    cardDetails: null,
    lastSyncAt: unlinkedAt,
    createdAt: linkedAt,
    sealed: await sealJson(
      {
        institutionName: 'Capital One',
        institutionLogo: SEED_LOGO_RED,
        providerAccounts: [
          {
            providerAccountId: 'seed-taylor-provider-checking',
            name: '360 Checking',
            kind: 'depository',
            mask: '4821',
            balanceCents: 182_500,
            accountId,
            cardId: null,
            isSkipped: false,
          },
          {
            providerAccountId: 'seed-taylor-provider-savings',
            name: '360 Savings',
            kind: 'depository',
            mask: '3302',
            balanceCents: 900_000,
            accountId: null,
            cardId: null,
            isSkipped: true,
          },
        ],
      } satisfies LinkSealed,
      encryption,
    ),
  } satisfies LinkDoc);
  const kept = [
    {
      id: 'seed-taylor-purchase-market',
      daysAgo: 8,
      merchant: 'Corner Market',
      amountCents: 4_218,
    },
    {
      id: 'seed-taylor-purchase-gas',
      daysAgo: 6,
      merchant: 'Shell',
      amountCents: 3_895,
    },
    {
      id: 'seed-taylor-purchase-pizza',
      daysAgo: 4,
      merchant: 'Slice House',
      amountCents: 2_460,
    },
  ];
  await Promise.all(
    kept.map(async (entry) => {
      const date = today - entry.daysAgo * DAY_MS;
      const stamp = date + 12 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/purchases/${entry.id}`), {
        id: entry.id,
        date,
        source: 'link',
        status: 'posted',
        needsHome: false,
        accountId,
        expenseId: null,
        dedupeKey: `${entry.id}-dedupe`,
        createdAt: stamp,
        updatedAt: stamp,
        sealed: await sealJson(
          {
            amountCents: entry.amountCents,
            merchant: entry.merchant,
            label: null,
            note: null,
            lines: [
              { envelopeId: null, cents: entry.amountCents, via: 'free' },
            ],
            refundOfId: null,
            paidByCardId: null,
            link: null,
            receiptText: null,
            costRef: null,
            notSameAs: null,
            incomeDayId: null,
            assignedBy: null,
            pairedWithId: null,
            pairKind: null,
            cardPaymentMoveId: null,
            tickedDayKey: null,
            category: null,
            ruleId: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      } satisfies PurchaseDoc);
    }),
  );
  await batch.commit();

  const itemDocuments =
    (await writeSeedIncome(context, owner.uid, encryption, accountId)) +
    (await writeSeedEnvelopes(context, owner.uid, encryption, true)) +
    (await writeSeedSelfPaying(context, owner.uid, encryption, 'track'));
  return (
    2 +
    envelopeStarts.length +
    changes.length +
    1 +
    1 +
    kept.length +
    itemDocuments
  );
}

const SEED_BIRTHDAY_EXPENSE = 'seed-expense-birthday';

/**
 * Jamie's spending (twelve rows, one group, an overspent dinner, a split and its refund) plus what waits in Needs a home from the bank link: a pending coffee, debits, deposits, two account moves and an unclear pair. One purchase a rule already placed.
 * The Sweetgreen lunch fits the restaurants rule and waits only because its merge offer (the typed one lacks the tip) is unanswered.
 */
async function writeSeedPurchases(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const groceries = 'seed-envelope-groceries';
  const gifts = 'seed-envelope-gifts';
  const line = (envelopeId: string, cents: number): PurchaseLine => ({
    envelopeId,
    cents,
    via: 'chosen',
  });
  const purchases: {
    id: string;
    daysAgo: number;
    merchant: string | null;
    label?: string;
    note: string | null;
    lines: PurchaseLine[];
    refundOfId?: string;
    editedAt?: number;
    paidByCardId?: string;
    link?: string;
    receiptText?: string;
    expenseId?: string;
    costRef?: CostRef;
  }[] = [
    {
      id: 'seed-purchase-safeway',
      daysAgo: 3,
      merchant: 'Safeway',
      note: null,
      receiptText:
        'Bananas  $2.18\nOat milk ×2  $9.98\nChicken thighs  $14.52\nSourdough  $5.49\nSalmon  $18.00\nCheese  $14.01\nTotal  $64.18',
      lines: [line(groceries, 6_418)],
      editedAt: 3_600_000,
    },
    {
      id: 'seed-purchase-shell',
      daysAgo: 5,
      merchant: 'Shell',
      note: null,
      lines: [line('seed-envelope-gas', 3_850)],
      paidByCardId: SEED_VENTURE_CARD,
    },
    {
      id: 'seed-purchase-ramen',
      daysAgo: 2,
      merchant: 'Ramen Ya',
      label: "Sam's birthday dinner",
      note: 'Sam paid for drinks',
      lines: [line('seed-envelope-dining', 3_800)],
      paidByCardId: SEED_VENTURE_CARD,
      expenseId: SEED_BIRTHDAY_EXPENSE,
    },
    {
      id: 'seed-purchase-target',
      daysAgo: 6,
      merchant: 'Target',
      note: 'Groceries and a birthday gift',
      link: 'https://www.target.com/orders',
      lines: [line(groceries, 6_000), line(gifts, 4_000)],
    },
    {
      id: 'seed-purchase-target-refund',
      daysAgo: 1,
      merchant: 'Target',
      note: 'Returned the gift set',
      lines: [line(groceries, -1_200), line(gifts, -800)],
      refundOfId: 'seed-purchase-target',
    },
    {
      id: 'seed-purchase-traderjoes',
      daysAgo: 12,
      merchant: "Trader Joe's",
      note: null,
      lines: [line(groceries, 4_210)],
    },
    {
      id: 'seed-purchase-costco',
      daysAgo: 18,
      merchant: 'Costco',
      note: null,
      lines: [line(groceries, 8_800)],
    },
    {
      id: 'seed-purchase-card',
      daysAgo: 9,
      merchant: null,
      label: 'Birthday card',
      note: null,
      lines: [line(gifts, 650)],
      expenseId: SEED_BIRTHDAY_EXPENSE,
    },
    {
      id: MOVERS_PURCHASE_ID,
      daysAgo: 4,
      merchant: 'Bay Movers',
      note: null,
      lines: [line('seed-horizon-moving', 60_000)],
      costRef: {
        itemId: 'seed-horizon-moving',
        costId: 'seed-cost-movers',
        dueOn: nextCalendarDay(today, 0, 15),
      },
    },
    {
      id: 'seed-purchase-cvs',
      daysAgo: 3,
      merchant: 'CVS',
      note: 'Allergy pills',
      lines: [line('seed-envelope-everyday', 2_350)],
    },
    {
      id: 'seed-purchase-lunch',
      daysAgo: 1,
      merchant: 'Sweetgreen',
      note: null,
      lines: [line('seed-envelope-dining', 1_425)],
      paidByCardId: SEED_VENTURE_CARD,
    },
    {
      id: 'seed-purchase-chipotle',
      daysAgo: 1,
      merchant: 'Chipotle',
      note: 'Burrito bowl and chips',
      lines: [
        line('seed-envelope-dining', 0),
        { envelopeId: 'seed-envelope-everyday', cents: 1_500, via: 'spill' },
        { envelopeId: 'seed-envelope-gifts', cents: 1_000, via: 'spill' },
      ],
    },
    {
      id: 'seed-purchase-market',
      daysAgo: 24,
      merchant: 'Farmers market',
      note: null,
      lines: [line(groceries, 1_800)],
    },
  ];

  const batch = context.firestore.batch();
  await Promise.all(
    purchases.map(async (entry) => {
      const date = today - entry.daysAgo * DAY_MS;
      const createdAt = date + 12 * 3_600_000;
      const amountCents = entry.lines.reduce((sum, l) => sum + l.cents, 0);
      batch.set(context.firestore.doc(`${plan}/purchases/${entry.id}`), {
        id: entry.id,
        date,
        source: 'manual',
        status: null,
        needsHome: false,
        accountId: null,
        dedupeKey: null,
        expenseId: entry.expenseId ?? null,
        createdAt,
        updatedAt: createdAt + (entry.editedAt ?? 0),
        sealed: await sealJson(
          {
            amountCents,
            merchant: entry.merchant,
            label: entry.label ?? null,
            note: entry.note,
            lines: entry.lines,
            refundOfId: entry.refundOfId ?? null,
            paidByCardId: entry.paidByCardId ?? null,
            link: entry.link ?? null,
            receiptText: entry.receiptText ?? null,
            costRef: entry.costRef ?? null,
            notSameAs: null,
            incomeDayId: null,
            assignedBy: null,
            pairedWithId: null,
            pairKind: null,
            cardPaymentMoveId: null,
            tickedDayKey: null,
            category: null,
            ruleId: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      } satisfies PurchaseDoc);
    }),
  );
  const waiting: {
    id: string;
    daysAgo: number;
    merchant: string;
    amountCents: number;
    status: 'pending' | 'posted';
    accountId: string | null;
    cardId: string | null;
    category?: string;
  }[] = [
    {
      id: 'seed-link-purchase-coffee',
      daysAgo: 1,
      merchant: 'Blue Bottle Coffee',
      amountCents: 675,
      status: 'pending',
      accountId: null,
      cardId: SEED_CHASE_CARD,
      category: 'FOOD_AND_DRINK_COFFEE',
    },
    {
      id: 'seed-link-purchase-gas',
      daysAgo: 2,
      merchant: 'Shell',
      amountCents: 4_110,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-purchase-pharmacy',
      daysAgo: 4,
      merchant: 'CVS Pharmacy',
      amountCents: 2_350,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-purchase-lunch',
      daysAgo: 1,
      merchant: 'Sweetgreen',
      amountCents: 1_640,
      status: 'posted',
      accountId: null,
      cardId: SEED_VENTURE_CARD,
      category: 'FOOD_AND_DRINK_RESTAURANT',
    },
    {
      id: 'seed-link-purchase-amazon',
      daysAgo: 2,
      merchant: 'Amazon',
      amountCents: 3_299,
      status: 'posted',
      accountId: null,
      cardId: SEED_DISCOVER_CARD,
      category: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
    },
    {
      id: 'seed-link-deposit-refund',
      daysAgo: 3,
      merchant: 'Venmo cash out',
      amountCents: -12_500,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-card-payment-waiting',
      daysAgo: 3,
      merchant: 'CAPITAL ONE MOBILE PYMT',
      amountCents: 45_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
      category: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    },
    {
      id: 'seed-link-savings-waiting',
      daysAgo: 5,
      merchant: 'Withdrawal to Wealthfront Cash',
      amountCents: 20_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
      category: 'TRANSFER_OUT_SAVINGS',
    },
    {
      id: 'seed-link-transfer-out',
      daysAgo: 2,
      merchant: 'Transfer to Checking B',
      amountCents: 25_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-transfer-in',
      daysAgo: 1,
      merchant: 'Transfer from Checking A',
      amountCents: -25_000,
      status: 'posted',
      accountId: 'seed-account-checking-b',
      cardId: null,
    },
    {
      id: 'seed-link-unclear-out-a',
      daysAgo: 3,
      merchant: 'Online transfer',
      amountCents: 10_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-unclear-out-b',
      daysAgo: 2,
      merchant: 'Transfer to Checking B',
      amountCents: 10_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-unclear-in',
      daysAgo: 2,
      merchant: 'Transfer from Checking A',
      amountCents: -10_000,
      status: 'posted',
      accountId: 'seed-account-checking-b',
      cardId: null,
    },
    {
      id: 'seed-link-card-payment-out',
      daysAgo: 1,
      merchant: 'Venture X payment',
      amountCents: 48_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-card-payment-in',
      daysAgo: 0,
      merchant: 'Payment thank you',
      amountCents: -48_000,
      status: 'posted',
      accountId: null,
      cardId: SEED_VENTURE_CARD,
    },
    {
      id: 'seed-link-held-out',
      daysAgo: 0,
      merchant: 'Transfer to Checking B',
      amountCents: 200_000,
      status: 'pending',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-held-in',
      daysAgo: 0,
      merchant: 'Deposit from Checking A',
      amountCents: -200_000,
      status: 'posted',
      accountId: 'seed-account-checking-b',
      cardId: null,
    },
    {
      id: 'seed-link-pending-in',
      daysAgo: 0,
      merchant: 'Fidelity withdrawal',
      amountCents: -190_000,
      status: 'pending',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-card-flagged-out',
      daysAgo: 3,
      merchant: 'Withdrawal to Venture X',
      amountCents: 10_025,
      status: 'posted',
      accountId: 'seed-account-checking-b',
      cardId: null,
      category: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    },
    {
      id: 'seed-link-card-flagged-in',
      daysAgo: 3,
      merchant: 'CAPITAL ONE MOBILE PYMT',
      amountCents: -10_025,
      status: 'posted',
      accountId: null,
      cardId: SEED_VENTURE_CARD,
      category: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    },
    {
      id: 'seed-link-card-decoy-in',
      daysAgo: 3,
      merchant: 'Deposit',
      amountCents: -10_025,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-deposit-pay',
      daysAgo: 0,
      merchant: 'Northwind Studio payroll',
      amountCents: -213_480,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
    {
      id: 'seed-link-deposit-client',
      daysAgo: 0,
      merchant: 'Client payment',
      amountCents: -15_000,
      status: 'posted',
      accountId: 'seed-account-checking-a',
      cardId: null,
    },
  ];
  await Promise.all(
    waiting.map(async (entry) => {
      const date = today - entry.daysAgo * DAY_MS;
      const createdAt = date + 12 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/purchases/${entry.id}`), {
        id: entry.id,
        date,
        source: 'link',
        status: entry.status,
        needsHome: true,
        accountId: entry.accountId,
        expenseId: null,
        dedupeKey: `${entry.id}-dedupe`,
        createdAt,
        updatedAt: createdAt,
        sealed: await sealJson(
          {
            amountCents: entry.amountCents,
            merchant: entry.merchant,
            label: null,
            note: null,
            lines:
              entry.amountCents > 0
                ? [{ envelopeId: null, cents: entry.amountCents, via: 'free' }]
                : [],
            refundOfId: null,
            paidByCardId: entry.cardId,
            link: null,
            receiptText: null,
            costRef: null,
            notSameAs: null,
            incomeDayId: null,
            assignedBy: null,
            pairedWithId: null,
            pairKind: null,
            cardPaymentMoveId: null,
            tickedDayKey: null,
            category: entry.category ?? null,
            ruleId: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      } satisfies PurchaseDoc);
    }),
  );
  const ruled = await seedRules(context, plan, encryption, today);
  const safewayDate = today - 3 * DAY_MS;
  const removedDate = today - 8 * DAY_MS;
  const changes = [
    {
      id: 'seed-change-purchase-edited',
      createdAt: safewayDate + 13 * 3_600_000,
      summary: 'Purchase changed: Safeway, amount $54.18 to $64.18.',
    },
    {
      id: 'seed-change-purchase-removed',
      createdAt: removedDate + 14 * 3_600_000,
      summary: `Purchase removed: Walgreens, $12.40 on ${formatDateOrdinalUTC(removedDate)}.`,
    },
  ];
  await Promise.all(
    changes.map(async (entry) => {
      batch.set(context.firestore.doc(`${plan}/changes/${entry.id}`), {
        id: entry.id,
        kind: 'purchaseChange',
        createdAt: entry.createdAt,
        effectiveFrom: null,
        itemIds: [groceries],
        sealed: await sealJson(
          { summary: entry.summary, note: null } satisfies ChangeSealed,
          encryption,
        ),
      } satisfies ChangeDoc);
    }),
  );
  const expenseCreatedAt = today - 3 * DAY_MS;
  batch.set(
    context.firestore.doc(`${plan}/expenses/${SEED_BIRTHDAY_EXPENSE}`),
    {
      id: SEED_BIRTHDAY_EXPENSE,
      createdAt: expenseCreatedAt,
      updatedAt: expenseCreatedAt,
      sealed: await sealJson(
        { name: "Sam's birthday", note: null } satisfies ExpenseSealed,
        encryption,
      ),
    } satisfies ExpenseDoc,
  );
  await batch.commit();
  return purchases.length + waiting.length + changes.length + 1 + ruled;
}

/**
 * Jamie's rules, sealed like the app seals them: Safeway, restaurants on the Venture X, everything on the Discover, and Amazon asks every time. Rules from an earlier run go first.
 * Only the Amazon charge is left to ask about; the Sweetgreen lunch waits on its merge offer, not on a rule.
 */
async function seedRules(
  context: SeedContext,
  plan: string,
  encryption: Parameters<typeof sealJson>[1],
  today: number,
): Promise<number> {
  const kept = await context.firestore.collection(`${plan}/rules`).get();
  await Promise.all(kept.docs.map((entry) => entry.ref.delete()));
  const createdAt = today - 10 * DAY_MS;
  const rules: { id: string; payload: RuleSealed }[] = [
    {
      id: 'seed-rule-safeway',
      payload: {
        merchantKey: 'safeway',
        merchantName: 'Safeway',
        category: null,
        cardId: null,
        target: 'seed-envelope-groceries',
      },
    },
    {
      id: 'seed-rule-restaurants',
      payload: {
        merchantKey: null,
        merchantName: null,
        category: 'FOOD_AND_DRINK_RESTAURANT',
        cardId: SEED_VENTURE_CARD,
        target: 'seed-envelope-dining',
      },
    },
    {
      id: 'seed-rule-discover',
      payload: {
        merchantKey: null,
        merchantName: null,
        category: null,
        cardId: SEED_DISCOVER_CARD,
        target: 'seed-envelope-everyday',
      },
    },
    {
      id: 'seed-rule-amazon',
      payload: {
        merchantKey: 'amazon',
        merchantName: 'Amazon',
        category: null,
        cardId: null,
        target: 'varies',
      },
    },
  ];
  const batch = context.firestore.batch();
  await Promise.all(
    rules.map(async ({ id, payload }, index) => {
      batch.set(context.firestore.doc(`${plan}/rules/${id}`), {
        id,
        createdAt: createdAt + index,
        updatedAt: createdAt + index,
        sealed: await sealJson(payload, encryption),
      } satisfies RuleDoc);
    }),
  );
  const date = today - 4 * DAY_MS;
  const placedAt = date + 12 * 3_600_000;
  batch.set(
    context.firestore.doc(`${plan}/purchases/seed-link-purchase-ruled`),
    {
      id: 'seed-link-purchase-ruled',
      date,
      source: 'link',
      status: 'posted',
      needsHome: false,
      accountId: null,
      expenseId: null,
      dedupeKey: 'seed-link-purchase-ruled-dedupe',
      createdAt: placedAt,
      updatedAt: placedAt,
      sealed: await sealJson(
        {
          amountCents: 4_725,
          merchant: 'Safeway',
          category: 'FOOD_AND_DRINK_GROCERIES',
          ruleId: 'seed-rule-safeway',
          label: null,
          note: null,
          lines: [
            {
              envelopeId: 'seed-envelope-groceries',
              cents: 4_725,
              via: 'chosen',
            },
          ],
          refundOfId: null,
          paidByCardId: SEED_VENTURE_CARD,
          link: null,
          receiptText: null,
          costRef: null,
          notSameAs: null,
          incomeDayId: null,
          assignedBy: 'auto',
          pairedWithId: null,
          pairKind: null,
          cardPaymentMoveId: null,
          tickedDayKey: null,
        } satisfies PurchaseSealed,
        encryption,
      ),
    } satisfies PurchaseDoc,
  );
  await Promise.all(
    [1, 2, 3].map(async (daysAgo, index) => {
      const id = `seed-link-purchase-sprouts-${index + 1}`;
      const at = today - daysAgo * DAY_MS;
      const createdAt = at + 12 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/purchases/${id}`), {
        id,
        date: at,
        source: 'link',
        status: 'posted',
        needsHome: false,
        accountId: null,
        expenseId: null,
        dedupeKey: `${id}-dedupe`,
        createdAt,
        updatedAt: createdAt,
        sealed: await sealJson(
          {
            amountCents: 3_180 + index * 240,
            merchant: 'Sprouts',
            category: 'FOOD_AND_DRINK_GROCERIES',
            ruleId: null,
            label: null,
            note: null,
            lines: [
              {
                envelopeId: 'seed-envelope-groceries',
                cents: 3_180 + index * 240,
                via: 'chosen',
              },
            ],
            refundOfId: null,
            paidByCardId: null,
            link: null,
            receiptText: null,
            costRef: null,
            notSameAs: null,
            incomeDayId: null,
            assignedBy: 'person',
            pairedWithId: null,
            pairKind: null,
            cardPaymentMoveId: null,
            tickedDayKey: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      } satisfies PurchaseDoc);
    }),
  );
  const twice: {
    id: string;
    source: 'link' | 'manual';
    daysAgo: number;
    amountCents: number;
    merchant: string;
  }[] = [
    {
      id: 'seed-link-history-placed',
      source: 'link',
      daysAgo: 16,
      amountCents: 6_210,
      merchant: 'Trader Joe’s',
    },
    {
      id: 'seed-typed-before-link',
      source: 'manual',
      daysAgo: 17,
      amountCents: 5_400,
      merchant: 'Trader Joe’s',
    },
  ];
  await Promise.all(
    twice.map(async (entry) => {
      const at = today - entry.daysAgo * DAY_MS;
      // The bank's copy arrived with the link, after the day it is dated.
      const createdAt =
        entry.source === 'link'
          ? context.now - 14 * DAY_MS + 3_600_000
          : at + 12 * 3_600_000;
      batch.set(context.firestore.doc(`${plan}/purchases/${entry.id}`), {
        id: entry.id,
        date: at,
        source: entry.source,
        status: 'posted',
        needsHome: false,
        accountId: null,
        expenseId: null,
        dedupeKey: entry.source === 'link' ? `${entry.id}-dedupe` : null,
        createdAt,
        updatedAt: createdAt,
        sealed: await sealJson(
          {
            amountCents: entry.amountCents,
            merchant: entry.merchant,
            category: null,
            ruleId: null,
            label: null,
            note: null,
            lines: [
              {
                envelopeId: 'seed-envelope-groceries',
                cents: entry.amountCents,
                via: 'chosen',
              },
            ],
            refundOfId: null,
            paidByCardId: SEED_VENTURE_CARD,
            link: null,
            receiptText: null,
            costRef: null,
            notSameAs: null,
            incomeDayId: null,
            assignedBy: null,
            pairedWithId: null,
            pairKind: null,
            cardPaymentMoveId: null,
            tickedDayKey: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      } satisfies PurchaseDoc);
    }),
  );
  await batch.commit();
  return rules.length + 4 + twice.length;
}

/**
 * Writes the closings the app would build for a seeded plan: every month from the starting day's through
 * the last one that may be closed, read back from the emulator and summed by the same code the app runs.
 * Closings left by an earlier run go first, since one for a later month would hide the seeded moves. Emulators only. Returns how many it wrote.
 */
export async function seedClosings(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  startDate: number,
): Promise<number> {
  const plan = `apps/runway/plans/${uid}`;
  const target = getLastClosableMonth(startOfUtcDay(context.now));
  const kept = await context.firestore.collection(`${plan}/closings`).get();
  await Promise.all(kept.docs.map((entry) => entry.ref.delete()));
  if (toMonthKey(startDate) > target) return 0;
  const items = await context.firestore.collection(`${plan}/items`).get();
  const billIds = new Set(
    items.docs
      .filter((entry) => entry.data().kind === 'bill')
      .map((entry) => entry.id),
  );
  const months = listMonths(toMonthKey(startDate), target);
  const states = await buildClosings(months, null, async (month) => {
    const from = getMonthStart(month);
    const to = getMonthStart(getNextMonth(month));
    const inMonth = (name: string, field: string) =>
      context.firestore
        .collection(`${plan}/${name}`)
        .where(field, '>=', from)
        .where(field, '<', to)
        .get();
    const [days, moves, purchases] = await Promise.all([
      inMonth('days', 'expectedOn'),
      inMonth('moves', 'date'),
      inMonth('purchases', 'date'),
    ]);
    return openMonthEntries(
      {
        days: days.docs,
        moves: moves.docs,
        purchases: purchases.docs,
        getRecords: async (dayId) =>
          (
            await context.firestore
              .collection(`${plan}/days/${dayId}/records`)
              .get()
          ).docs,
      },
      encryption,
      startDate,
      billIds,
    );
  });
  const writer = context.firestore.bulkWriter();
  await Promise.all(
    states.map(async (state) => {
      const sealed = await sealJson(encodeClosing(state), encryption);
      void writer.set(
        context.firestore.doc(`${plan}/closings/${state.month}`),
        {
          id: state.month,
          month: state.month,
          createdAt: context.now,
          sealed,
        } satisfies ClosingDoc,
      );
    }),
  );
  await writer.close();
  return states.length;
}
