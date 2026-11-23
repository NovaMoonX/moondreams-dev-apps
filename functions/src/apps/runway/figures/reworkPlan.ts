import type {
  DocumentData,
  Firestore,
  QuerySnapshot,
} from 'firebase-admin/firestore';

import { getFreeToSpendFigure } from '../engine/balances.js';
import { DAY_MS, dayInZone } from '../engine/dates.js';
import {
  decodeClosing,
  getHistory,
  getMonthStart,
  getNextMonth,
  getPreviousMonth,
  getValidClosing,
  toMonthKey,
  type ClosingState,
} from '../engine/closings.js';
import {
  ENGINE_VERSION,
  MOVE_KINDS,
  RECENT_DAYS_WINDOW,
} from '../engine/engineConstants.js';
import {
  computeFigures,
  toFiguresInput,
  type FiguresSnapshotSealed,
} from '../engine/figures.js';
import {
  openAccount,
  openAccountBalance,
  openCard,
  openDay,
  openItem,
  openMove,
  openPlan,
  openPurchase,
  openRecord,
  openStartedPayment,
  openVersion,
  type ReadSealed,
} from '../engine/openDocs.js';
import {
  buildShareSummary,
  toShareSummaryInput,
  type SummaryFigures,
} from '../engine/shareSummary.js';
import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  wrappedKeyPath,
  type Keyring,
  type SealedPayload,
} from '../planKey.js';
import type {
  AccountBalanceDoc,
  AccountDoc,
  CardDoc,
  ClosingSealed,
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  PlanDoc,
  PlanItemDoc,
  PlanSealedFields,
  PlanVersionDoc,
  PurchaseDoc,
  ShareSummary,
  StartedPaymentDoc,
} from '../runwayTypes.js';
import { HOUR_MS, pickZone } from './reworkState.js';

const SUMMARY_FRESH_MS = 6 * HOUR_MS;
const KNOWN_KINDS: readonly string[] = MOVE_KINDS;

export type ReworkOutcome = { kind: 'gone' } | { kind: 'done'; zone: string };

const planPath = (uid: string) => `apps/runway/plans/${uid}`;

const withId = <T>(entry: { id: string; data(): DocumentData }) =>
  ({ ...entry.data(), id: entry.id }) as T;

const asSealed = (value: unknown) => value as SealedPayload;

/** Optional bank data: a document that will not open is left out rather than failing the plan, as the phone does. */
const openOrSkip = async <T>(open: () => Promise<T>): Promise<T[]> =>
  open().then(
    (value) => [value],
    () => [],
  );

/** The newest closing the phone would read (before `dirtyFrom` when set), decoded; one that will not open is none. */
async function readClosing(
  firestore: Firestore,
  uid: string,
  dirtyFrom: string | null,
  key: Buffer,
): Promise<ClosingState | null> {
  const collection = firestore.collection(`${planPath(uid)}/closings`);
  const snapshot = await (
    dirtyFrom === null ? collection : collection.where('month', '<', dirtyFrom)
  )
    .orderBy('month', 'desc')
    .limit(1)
    .get();
  const entry = snapshot.docs[0];
  if (!entry) return null;
  try {
    const sealed = openWithKey(
      key,
      asSealed(entry.get('sealed')),
    ) as unknown as ClosingSealed;
    return decodeClosing(entry.get('month') as string, sealed);
  } catch {
    return null;
  }
}

/** Where the window the figures sum starts: the phone's reading when its history is ready, else (a rebuild the server never does) from the month after the newest valid closing, or from the month before the starting day. */
function getWindow(
  startDate: number | null,
  dirtyFrom: string | null,
  candidate: ClosingState | null,
  today: number,
) {
  const input = { startDate, dirtyFrom, closing: candidate, today };
  const history = getHistory({ ...input, hasFailed: false });
  if (history.status === 'ready') return history;
  const closing = getValidClosing(input);
  const from =
    closing !== null
      ? getMonthStart(getNextMonth(closing.month))
      : startDate === null
        ? today - RECENT_DAYS_WINDOW * DAY_MS
        : getMonthStart(getPreviousMonth(toMonthKey(startDate)));
  return { closing, from };
}

const toDocs = <T>(snapshot: QuerySnapshot) =>
  snapshot.docs.map((entry) => withId<T>(entry));

/** The summary the phone would write, as its own decision: clear when Free to Spend is unknown, keep a current one, else seal a new one. */
async function writeShareSummary(
  firestore: Firestore,
  uid: string,
  key: Awaited<ReturnType<typeof unwrapPlanKey>>,
  stored: unknown,
  summary: SummaryFigures | null,
  isUnknown: boolean,
  now: number,
) {
  const planRef = firestore.doc(planPath(uid));
  const hasStored = typeof stored === 'object' && stored !== null;
  if (isUnknown) {
    if (hasStored) await planRef.update({ shareSummary: null });
    return;
  }
  if (summary === null) return;
  if (hasStored) {
    try {
      const { computedAt, ...old } = openWithKey(
        key.key,
        asSealed(stored),
      ) as unknown as ShareSummary;
      if (
        JSON.stringify(old) === JSON.stringify(summary) &&
        now - computedAt < SUMMARY_FRESH_MS
      ) {
        return;
      }
    } catch {
      // A summary that will not open is written again.
    }
  }
  await planRef.update({
    shareSummary: sealWithKey(
      key,
      { ...summary, computedAt: now },
      SEALED_SCHEMA_VERSION,
    ),
  });
}

/**
 * Works out a plan's figures from the stored documents and writes them sealed to `figures/current`, then
 * keeps the plan's share summary current. Reads what the phone's figures read for the same day and writes
 * nothing else: never a closing, never the plan's `updatedAt`.
 */
export async function reworkPlan(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  now: number,
): Promise<ReworkOutcome> {
  const planSnapshot = await firestore.doc(planPath(uid)).get();
  if (!planSnapshot.exists) return { kind: 'gone' };
  const planKey = await unwrapPlanKey(firestore, keyring, uid).catch(
    async (error: unknown) => {
      if ((await firestore.doc(wrappedKeyPath(uid)).get()).exists) throw error;
      return null;
    },
  );
  if (planKey === null) return { kind: 'gone' };

  const read: ReadSealed = async <T extends object>(sealed: unknown) =>
    openWithKey(planKey.key, asSealed(sealed)) as T;
  const planDoc = { ...planSnapshot.data(), uid } as PlanDoc;
  const plan = openPlan(
    planDoc,
    planDoc.sealed ? await read<PlanSealedFields>(planDoc.sealed) : null,
  );
  const zone = pickZone(plan.timeZone, plan.notifyTimeZone);
  const today = dayInZone(now, zone);
  const dirtyFrom = plan.dirtyFrom;
  const { closing, from } = getWindow(
    plan.startDate,
    dirtyFrom,
    await readClosing(firestore, uid, dirtyFrom, planKey.key),
    today,
  );

  const under = (name: string) =>
    firestore.collection(`${planPath(uid)}/${name}`);
  const [
    items,
    versions,
    cards,
    accounts,
    accountBalances,
    startedPayments,
    dayDocs,
    recentMoves,
    startMoves,
    purchases,
    needsHome,
  ] = await Promise.all([
    under('items').get(),
    under('versions').get(),
    under('cards').get(),
    under('accounts').get(),
    under('accountBalances').get(),
    under('startedPayments').get(),
    under('days').where('expectedOn', '>=', from).get(),
    under('moves').where('date', '>=', from).get(),
    under('moves').where('kind', '==', 'start').get(),
    under('purchases').where('date', '>=', from).get(),
    under('purchases').where('needsHome', '==', true).get(),
  ]);

  const days = await Promise.all(
    toDocs<IncomeDayDoc & { id: string }>(dayDocs).map((day) =>
      openDay(day, read),
    ),
  );
  const [records, moves] = await Promise.all([
    Promise.all(
      days
        .filter((day) => day.status === 'confirmed')
        .map(async (day) =>
          Promise.all(
            toDocs<DayRecordDoc & { id: string }>(
              await under(`days/${day.id}/records`).get(),
            ).map((record) => openRecord(record, read)),
          ),
        ),
    ),
    Promise.all(
      [
        ...new Map(
          [...toDocs<MoveDoc>(recentMoves), ...toDocs<MoveDoc>(startMoves)].map(
            (move) => [move.id, move],
          ),
        ).values(),
      ]
        .filter((move) => KNOWN_KINDS.includes(move.kind))
        .map((move) => openMove(move, read)),
    ),
  ]);
  const input = toFiguresInput({
    today,
    zone,
    plan,
    items: toDocs<Partial<PlanItemDoc> & { id: string }>(items).map(openItem),
    versions: (
      await Promise.all(
        toDocs<PlanVersionDoc>(versions).map((version) =>
          openVersion(version, read),
        ),
      )
    ).filter((version) => version !== null),
    days,
    moves,
    records: records.flat(),
    purchases: await Promise.all(
      toDocs<PurchaseDoc>(purchases).map((purchase) =>
        openPurchase(purchase, read),
      ),
    ),
    needsHome: await Promise.all(
      toDocs<PurchaseDoc>(needsHome).map((purchase) =>
        openPurchase(purchase, read),
      ),
    ),
    cards: await Promise.all(
      toDocs<CardDoc & { id: string }>(cards).map((card) =>
        openCard(card, read),
      ),
    ),
    savedAccounts: await Promise.all(
      toDocs<AccountDoc & { id: string }>(accounts).map((account) =>
        openAccount(account, read),
      ),
    ),
    accountBalances: (
      await Promise.all(
        toDocs<AccountBalanceDoc>(accountBalances).map((entry) =>
          openOrSkip(() => openAccountBalance(entry, read)),
        ),
      )
    ).flat(),
    startedPayments: (
      await Promise.all(
        toDocs<StartedPaymentDoc>(startedPayments).map((entry) =>
          openOrSkip(() => openStartedPayment(entry, read)),
        ),
      )
    ).flat(),
    closing,
  });
  const figures = computeFigures(input);
  const snapshot: FiguresSnapshotSealed = {
    timeZone: zone,
    level: figures.level,
    balances: figures.balances,
    billCover: figures.billCover,
    bankBacking: figures.bankBacking,
    nextPayOn: figures.nextPayOn,
    dueBeforePay: figures.dueBeforePay,
  };
  await firestore.doc(`${planPath(uid)}/figures/current`).set({
    id: 'current',
    engineVersion: ENGINE_VERSION,
    asOf: today,
    computedAt: now,
    planStamp: plan.updatedAt,
    sealed: sealWithKey(planKey, { ...snapshot }, SEALED_SCHEMA_VERSION),
  });

  await writeShareSummary(
    firestore,
    uid,
    planKey,
    planSnapshot.get('shareSummary'),
    buildShareSummary(
      toShareSummaryInput(figures, {
        today,
        currency: plan.currencyCode,
        startDate: plan.startDate,
        recentFrom: from,
      }),
    ),
    getFreeToSpendFigure(figures.balances).kind === 'unknown',
    now,
  );
  return { kind: 'done', zone };
}
