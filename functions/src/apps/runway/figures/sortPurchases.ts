import { randomUUID } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getCardName } from '../engine/cardNames.js';
import { getDirtyFrom } from '../engine/closings.js';
import { MAX_PURCHASE_LINES } from '../engine/engineConstants.js';
import { toItemLooks, type ItemLook } from '../engine/itemLooks.js';
import {
  describeRule,
  describeRulePlaced,
  getRuleEntryId,
  toRulePlacedSealed,
} from '../engine/doneText.js';
import { findEmailTwins, getTwinHeldIds } from '../engine/emailTwins.js';
import {
  getPaysItselfFromByBill,
  mergePurchases,
  resolveEnvelopes,
  type Figures,
  type FiguresInput,
} from '../engine/figures.js';
import { toAutoBills } from '../engine/autoPay.js';
import { makeIsLinkHistory } from '../engine/linkHistory.js';
import { openPurchase, type ReadSealed } from '../engine/openDocs.js';
import { isTrackingLevel } from '../engine/level.js';
import {
  getCountedFrom,
  isEnvelopeLive,
  isInTrackingPeriods,
  sumLines,
  toAssignedSealed,
} from '../engine/purchases.js';
import {
  planRulePlacements,
  RULE_VARIES,
  type PlannedPlacement,
  type RulePlacementInput,
} from '../engine/rules.js';
import { planPath } from '../email/emailShared.js';
import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import { openWithKey, sealWithKey, type SealedPayload } from '../planKey.js';
import type {
  ChangeDoc,
  ChangeSealed,
  DateOnly,
  DoneForYouDoc,
  OpenPurchase,
  OpenRule,
  PlanDoc,
  PlanItemDoc,
  PurchaseDoc,
} from '../runwayTypes.js';
import type { PlanKey } from './reworkPlan.js';

/** A run places at most this many, so one plan never holds the lease long; the next run takes the rest. */
const MAX_PLACEMENTS = 50;

/** A purchase's id is its document's, and a purchase placed is as the device writes it. */
export interface Placed {
  before: OpenPurchase;
  after: OpenPurchase;
}

export interface SortLists {
  rules: readonly OpenRule[];
  /** Only each link's id and day are read: they tell a bank's history from what came after. */
  links: readonly { id: string; createdAt: number }[];
  matchKeys: Readonly<Record<string, string[]>>;
}

export interface SortContext {
  /** The opened lists the figures were worked out from. */
  input: FiguresInput;
  figures: Figures;
  /** The plan's mark of the earliest closed month a write touched. */
  dirtyFrom: string | null;
  /** Called only when a waiting purchase could be placed by a rule. */
  readLists: () => Promise<SortLists>;
  /** The first day the lists read, which the bills' look-back starts from. */
  from: DateOnly;
}

/** A charge dated in a month already closed is left for the phone, which rebuilds that closing. */
const isInClosedMonth = (
  dirtyFrom: string | null,
  purchase: Pick<OpenPurchase, 'date'>,
  today: DateOnly,
) => getDirtyFrom(dirtyFrom, [purchase.date], today).isTouched;

/** The newest emoji each purpose chose, archived ones too, as the phone's item looks read them. */
const toPurposeEmojis = (versions: FiguresInput['versions']) =>
  new Map(
    [
      ...toItemLooks(
        versions.filter(({ kind }) => kind === 'group'),
        new Map(),
      ),
    ].flatMap(([id, { emoji }]) =>
      emoji === null ? [] : [[id, emoji] as const],
    ),
  );

const toCardLabel = (cardId: string | null, cards: FiguresInput['cards']) => {
  const card = cards.find(({ id }) => id === cardId);
  return card ? getCardName(card, cards) : null;
};

/** What the phone's pass reads, from the same opened lists the figures came from. */
export function toPlacementInput(
  { input, figures, dirtyFrom, from }: SortContext,
  { rules, links, matchKeys }: SortLists,
  today: DateOnly,
): RulePlacementInput {
  const accounts = input.accounts.filter(
    ({ archivedAt }) => archivedAt === null,
  );
  const envelopes = resolveEnvelopes(input.items, input.versions, today);
  return {
    level: figures.level,
    today,
    needsHome: input.needsHome,
    purchases: input.purchases,
    rules,
    autoBills: toAutoBills(
      figures.detail.bills,
      figures.detail.payments,
      figures.level,
      input.moves,
      accounts,
      matchKeys,
      input.plan.startDate ?? null,
      from,
      getPaysItselfFromByBill(input.versions),
    ),
    accounts,
    spill: {
      trackingPeriods: input.plan.trackingPeriods,
      envelopes,
      assignedByItem: () => figures.detail.assignedByItem,
    },
    twinHeld: getTwinHeldIds(
      findEmailTwins(mergePurchases(input.needsHome, input.purchases)),
    ),
    isLinkHistory: makeIsLinkHistory(
      links,
      input.accounts,
      input.cards,
      input.zone,
    ),
    isExcluded: (purchase) => isInClosedMonth(dirtyFrom, purchase, today),
  };
}

/** The lists as a fresh read would give them after `placed` was written. */
export function applyPlaced(
  input: FiguresInput,
  placed: readonly Placed[],
  from: DateOnly,
): FiguresInput {
  const after = new Map(placed.map(({ after: entry }) => [entry.id, entry]));
  const inWindow = new Set(input.purchases.map(({ id }) => id));
  return {
    ...input,
    needsHome: input.needsHome.filter(({ id }) => !after.has(id)),
    purchases: [
      ...input.purchases.map((purchase) => after.get(purchase.id) ?? purchase),
      ...[...after.values()].filter(
        (purchase) => !inWindow.has(purchase.id) && purchase.date >= from,
      ),
    ],
  };
}

const isUnpaired = (purchase: OpenPurchase) =>
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  purchase.cardPaymentMoveId === null &&
  purchase.tickedDayKey === null;

/** Whether a purchase's day counts, as the phone's check reads it; a bank's own day is never refused, since it can be before tracking began. */
const isDayCounted = (
  plan: Partial<PlanDoc>,
  purchase: OpenPurchase,
): boolean =>
  purchase.source === 'link' ||
  (isInTrackingPeriods(plan.trackingPeriods ?? [], purchase.date) &&
    getCountedFrom(plan.trackingPeriods ?? []) !== null);

interface Shared {
  firestore: Firestore;
  key: PlanKey;
  uid: string;
  now: number;
  today: DateOnly;
  looks: ReadonlyMap<string, ItemLook>;
  describe: (rule: OpenRule) => string;
}

/** Writes one placement in one transaction, or nothing when the purchase, the plan or the envelope is no longer as it was read. */
async function placeOne(
  shared: Shared,
  { purchase, rule, lines }: PlannedPlacement,
): Promise<Placed | null> {
  const { firestore, key, uid, now, looks } = shared;
  const read: ReadSealed = async <T extends object>(sealed: unknown) =>
    openWithKey(key.key, sealed as SealedPayload) as T;
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const purchaseRef = firestore.doc(
    `${planPath(uid)}/purchases/${purchase.id}`,
  );
  const planRef = firestore.doc(planPath(uid));
  const envelopeIds = [
    ...new Set(lines.flatMap(({ envelopeId }) => envelopeId ?? [])),
  ];
  return firestore.runTransaction(async (transaction) => {
    const [purchaseSnapshot, planSnapshot, ...itemSnapshots] =
      await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(planRef),
        ...envelopeIds.map((id) =>
          transaction.get(firestore.doc(`${planPath(uid)}/items/${id}`)),
        ),
      ]);
    if (!purchaseSnapshot.exists || !planSnapshot.exists) return null;
    const doc = purchaseSnapshot.data() as PurchaseDoc;
    if (
      doc.updatedAt !== purchase.updatedAt ||
      !doc.needsHome ||
      doc.status === 'pending'
    ) {
      return null;
    }
    const stored = await openPurchase({ ...doc, id: purchase.id }, read);
    const plan = planSnapshot.data() as Partial<PlanDoc>;
    if (
      stored.assignedBy !== null ||
      stored.billRef ||
      lines.length > MAX_PURCHASE_LINES ||
      sumLines(lines) !== stored.amountCents ||
      !isUnpaired(stored) ||
      !isDayCounted(plan, stored) ||
      !itemSnapshots.every((snapshot) =>
        isEnvelopeLive(snapshot.data() as PlanItemDoc | undefined),
      )
    ) {
      return null;
    }

    const updatedAt = Math.max(now, stored.updatedAt + 1);
    const sentence = shared.describe(rule);
    const after: OpenPurchase = {
      ...stored,
      lines,
      needsHome: false,
      assignedBy: 'auto',
      ruleId: rule.id,
      updatedAt,
    };
    const changeSealed: ChangeSealed = {
      summary: describeRulePlaced(stored, lines, nameOf, sentence),
      note: null,
    };
    const change: ChangeDoc = {
      id: randomUUID(),
      kind: 'purchaseChange',
      createdAt: updatedAt,
      effectiveFrom: null,
      itemIds: envelopeIds.slice(0, 20),
      sealed: sealWithKey(key, { ...changeSealed }, SEALED_SCHEMA_VERSION),
    };
    const entryId = getRuleEntryId(stored);
    const entry: DoneForYouDoc = {
      id: entryId,
      kind: 'rule',
      createdAt: Date.now(),
      undoneAt: null,
      sealed: sealWithKey(
        key,
        { ...toRulePlacedSealed(after, sentence, looks) },
        SEALED_SCHEMA_VERSION,
      ),
    };
    transaction.update(purchaseRef, {
      needsHome: false,
      updatedAt,
      sealed: sealWithKey(
        key,
        { ...toAssignedSealed(stored, lines, rule.id, 'auto') },
        SEALED_SCHEMA_VERSION,
      ),
    });
    transaction.set(
      firestore.doc(`${planPath(uid)}/changes/${change.id}`),
      change,
    );
    transaction.create(
      firestore.doc(`${planPath(uid)}/doneForYou/${entryId}`),
      entry,
    );
    return { before: stored, after };
  });
}

/**
 * Places the waiting posted charges the person's rules fit, one transaction each, each recorded in Done for you with the entry the phone would write.
 * Bills that pay themselves, deposits, account pairs and merges stay on the phone, a charge the bank has not posted yet waits, and one dated in a closed month is left for the phone.
 */
export async function sortPurchases(
  context: SortContext,
  shared: Omit<Shared, 'looks' | 'describe'>,
): Promise<Placed[]> {
  const { input, figures } = context;
  const isWorthReading =
    isTrackingLevel(figures.level) &&
    input.needsHome.some(
      (purchase) =>
        purchase.status !== 'pending' && purchase.assignedBy === null,
    );
  if (!isWorthReading) return [];
  const found = planRulePlacements(
    toPlacementInput(context, await context.readLists(), shared.today),
    { postedOnly: true },
  ).slice(0, MAX_PLACEMENTS);
  if (found.length === 0) return [];

  const looks = toItemLooks(input.versions, toPurposeEmojis(input.versions));
  const describe = (rule: OpenRule) =>
    describeRule(rule, {
      envelope:
        rule.target === RULE_VARIES ? '' : (looks.get(rule.target)?.name ?? ''),
      card: toCardLabel(rule.cardId, input.cards),
    });
  const withNames: Shared = { ...shared, looks, describe };
  const placed = await found.reduce<Promise<Placed[]>>(
    async (previous, placement) => {
      const done = await previous;
      const result = await placeOne(withNames, placement).catch(
        (error: unknown) => {
          logSortFailure(error);
          return null;
        },
      );
      return result === null ? done : [...done, result];
    },
    Promise.resolve([]),
  );
  logger.info('runway.sort.done', {
    placed: placed.length,
    skipped: found.length - placed.length,
  });
  return placed;
}

/** A failure is logged by its code alone, never a name or an amount. */
export const logSortFailure = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  logger.warn('runway.sort.failed', {
    code: typeof code === 'string' || typeof code === 'number' ? code : null,
  });
};
