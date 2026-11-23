import { readHeldReleasedOn } from './endings';
import { DEFAULT_CURRENCY_CODE } from './engineConstants';
import { readHorizon } from './horizon';
import { readStance } from './stance';
import type {
  AccountBalanceDoc,
  AccountDoc,
  AccountSealed,
  BillPaidSealed,
  BillSealed,
  CardDoc,
  CardPaymentSealed,
  CardSealed,
  Cents,
  ConfirmedSealed,
  CorrectionSealed,
  CostPaidSealed,
  DayOverrideSealed,
  DayRecordDoc,
  Sealed,
  EnvelopeSealed,
  FundingAmount,
  FundingRule,
  GoalSealed,
  GroupSealed,
  HorizonStored,
  IncomeDayDoc,
  MoveDoc,
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
  Pairing,
  PayLineSealed,
  PlanDoc,
  PlanItemDoc,
  PlanSealedFields,
  PlanVersionDoc,
  ProposedSealed,
  PurchaseDoc,
  PurchaseSealed,
  RecordLine,
  SourceSealed,
  StartedPaymentDoc,
  StartedPaymentSealed,
  StartSealed,
  TrackingChangeSealed,
  TransferSealed,
} from '@apps/runway/types';

/** Opens one sealed payload; the browser's and the server's each supply their own. */
export type ReadSealed = <T extends object>(sealed: Sealed) => Promise<T>;

/** A funding rule read from a document written before amounts had a `kind`: a bare `{ cents }` is exact. */
export function normalizeFunding(funding: FundingRule): FundingRule {
  const amount = funding.amount as FundingAmount | { cents: number };
  if ('kind' in amount) return funding;
  const result: FundingRule = {
    ...funding,
    amount: { kind: 'exact', cents: amount.cents },
  };
  return result;
}

// A bank's account name can carry its masked number ("XXXXXXX3153", "...3153", "••3153") and who holds it ("- Credit Holder").
// One mask character must touch its digits ("x1234"); only a run of them may have a space ("XX 1234"), so "Venture X 2024" stays.
const MASKED_NUMBER =
  /\s*(?:[([]\s*)?(?<![A-Za-z0-9])(?:[Xx*•.…]{2,}\s*-?\s*|[Xx*•…])\d{2,6}(?![\d.])(?:\s*[)\]])?/g;
const HOLDER_PART =
  /\s+[-–—]\s+[^-–—]*\b(?:holder|user|member|owner)\b[^-–—]*$/i;

/** An account or card name as a person would say it: "Venture X - Credit Holder XXXXXXX3153" reads "Venture X". */
export const cleanBankName = (name: string) => {
  const unmasked = name.replace(MASKED_NUMBER, '');
  // Who holds it is only dropped beside a masked number, so a name's own words stay.
  const cleaned = (unmasked === name ? name : unmasked.replace(HOLDER_PART, ''))
    .replace(/\s+[-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || name.trim();
};

export async function openMove(
  entry: MoveDoc,
  read: ReadSealed,
): Promise<OpenMove> {
  const base = {
    id: entry.id,
    date: entry.date,
    refId: entry.refId ?? null,
    reversesMoveId: entry.reversesMoveId ?? null,
    createdAt: entry.createdAt,
  };
  if (entry.kind === 'start') {
    const payload = await read<StartSealed>(entry.sealed);
    return { ...base, kind: 'start', payload };
  }
  if (entry.kind === 'trackingChange') {
    const payload = await read<TrackingChangeSealed>(entry.sealed);
    return { ...base, kind: 'trackingChange', payload };
  }
  if (entry.kind === 'cardPayment') {
    const payload = await read<CardPaymentSealed>(entry.sealed);
    return { ...base, kind: 'cardPayment', payload };
  }
  if (entry.kind === 'transfer') {
    const payload = await read<TransferSealed>(entry.sealed);
    return {
      ...base,
      kind: 'transfer',
      payload: { ...payload, isOutside: payload.isOutside ?? false },
    };
  }
  if (entry.kind === 'costPaid') {
    const payload = await read<CostPaidSealed>(entry.sealed);
    return {
      ...base,
      kind: 'costPaid',
      payload: { ...payload, purchaseId: payload.purchaseId ?? null },
    };
  }
  const payload = await read<BillPaidSealed>(entry.sealed);
  return {
    ...base,
    kind: 'billPaid',
    payload: {
      ...payload,
      cardId: payload.cardId ?? null,
      auto: payload.auto ?? null,
    },
  };
}

/** A line sealed before Horizon costs has no cost and gives nothing back to Free to Spend. */
export const withLineDefaults = <T extends { lines: RecordLine[] }>(
  payload: T,
): T => ({
  ...payload,
  lines: payload.lines.map((line) => ({
    ...line,
    costId: line.costId ?? null,
    costName: line.costName ?? null,
    repaysFree: line.repaysFree ?? false,
  })),
});

export async function openPurchase(
  entry: PurchaseDoc,
  read: ReadSealed,
): Promise<OpenPurchase> {
  const payload = await read<PurchaseSealed>(entry.sealed);
  // Before labels, a note with no merchant was what named the row, so it reads as the label.
  const isNoteName = payload.label === undefined && !payload.merchant?.trim();
  const result: OpenPurchase = {
    id: entry.id,
    date: entry.date,
    source: entry.source,
    status: entry.status ?? null,
    accountId: entry.accountId ?? null,
    needsHome: entry.needsHome,
    expenseId: entry.expenseId ?? null,
    emailEventId: entry.emailEventId ?? null,
    emailWaiting: entry.emailWaiting ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    amountCents: payload.amountCents,
    merchant: payload.merchant ?? null,
    bankName: payload.bankName ?? null,
    merchantLogo: payload.merchantLogo?.startsWith('https://')
      ? payload.merchantLogo
      : null,
    category: payload.category ?? null,
    ruleId: payload.ruleId ?? null,
    label: isNoteName ? (payload.note ?? null) : (payload.label ?? null),
    note: isNoteName ? null : (payload.note ?? null),
    lines: payload.lines ?? [],
    refundOfId: payload.refundOfId ?? null,
    paidByCardId: payload.paidByCardId ?? null,
    link: payload.link ?? null,
    receiptText: payload.receiptText ?? null,
    costRef: payload.costRef ?? null,
    billRef: payload.billRef ?? null,
    notSameAs: payload.notSameAs ?? null,
    incomeDayId: payload.incomeDayId ?? null,
    assignedBy: payload.assignedBy ?? null,
    pairedWithId: payload.pairedWithId ?? null,
    pairKind: payload.pairKind ?? null,
    cardPaymentMoveId: payload.cardPaymentMoveId ?? null,
    tickedDayKey: payload.tickedDayKey ?? null,
  };
  return result;
}

/** A version written before pairings existed has none. */
const normalizePairings = (pairings: Pairing[] | undefined): Pairing[] =>
  pairings ?? [];

/** A kind this build does not read yet is left out rather than failing the whole plan. */
export async function openVersion(
  version: PlanVersionDoc,
  read: ReadSealed,
): Promise<OpenVersion | null> {
  const base = {
    id: version.id,
    itemId: version.itemId,
    createdAt: version.createdAt,
    effectiveFrom: version.effectiveFrom,
    effectiveUntil: version.effectiveUntil ?? null,
    changeId: version.changeId,
  };
  if (version.kind === 'source') {
    const payload = await read<Partial<SourceSealed> & { name: string }>(
      version.sealed,
    );
    return {
      ...base,
      kind: 'source',
      payload: { ...payload, pairings: normalizePairings(payload.pairings) },
    };
  }
  if (version.kind === 'payLine') {
    const payload = await read<
      Omit<PayLineSealed, 'pairings'> & { pairings?: Pairing[] }
    >(version.sealed);
    return {
      ...base,
      kind: 'payLine',
      payload: { ...payload, pairings: normalizePairings(payload.pairings) },
    };
  }
  if (version.kind === 'envelope') {
    const payload = await read<
      Omit<EnvelopeSealed, 'groupId' | 'maxCents' | 'spillTo'> & {
        groupId?: string | null;
        maxCents?: Cents | null;
        spillTo?: string[] | null;
      }
    >(version.sealed);
    return {
      ...base,
      kind: 'envelope',
      payload: {
        ...payload,
        funding: normalizeFunding(payload.funding),
        maxCents: payload.maxCents ?? null,
        groupId: payload.groupId ?? null,
        spillTo: payload.spillTo ?? [],
      },
    };
  }
  if (version.kind === 'bill') {
    const payload = await read<
      Omit<BillSealed, 'groupId'> & { groupId?: string | null }
    >(version.sealed);
    return {
      ...base,
      kind: 'bill',
      payload: { ...payload, groupId: payload.groupId ?? null },
    };
  }
  if (version.kind === 'group') {
    const payload = await read<GroupSealed>(version.sealed);
    return {
      ...base,
      kind: 'group',
      payload: {
        ...payload,
        startingPriority: payload.startingPriority ?? null,
        envelopePriority:
          payload.envelopePriority === undefined
            ? (payload.startingPriority ?? null)
            : payload.envelopePriority,
        goalPriority: payload.goalPriority ?? null,
        emoji: payload.emoji ?? null,
      },
    };
  }
  if (version.kind === 'goal') {
    const payload = await read<
      Omit<GoalSealed, 'groupId'> & { groupId?: string | null }
    >(version.sealed);
    return {
      ...base,
      kind: 'goal',
      payload: {
        ...payload,
        funding: normalizeFunding(payload.funding),
        groupId: payload.groupId ?? null,
      },
    };
  }
  if (version.kind === 'horizon') {
    const payload = await read<HorizonStored>(version.sealed);
    return { ...base, kind: 'horizon', payload: readHorizon(payload) };
  }
  return null;
}

export async function openDay(
  entry: IncomeDayDoc,
  read: ReadSealed,
): Promise<OpenDay> {
  const opened = entry.sealed
    ? await read<Partial<DayOverrideSealed>>(entry.sealed)
    : null;
  const result: OpenDay = {
    id: entry.id,
    payLineId: entry.payLineId,
    sourceId: entry.sourceId ?? null,
    expectedOn: entry.expectedOn,
    arrivedOn: entry.arrivedOn ?? null,
    confirmedAt: entry.confirmedAt ?? null,
    status: entry.status,
    doneLineIds: entry.doneLineIds ?? [],
    override: {
      pairings: opened?.pairings ?? null,
      holdResolutions: opened?.holdResolutions ?? {},
      payloads: opened?.payloads ?? {},
      billCents: opened?.billCents ?? {},
    },
  };
  return result;
}

/** An item's header as the plan lists it; a field an older document lacks reads as none. */
export const openItem = (
  data: Partial<PlanItemDoc> & { id: string },
): PlanItemDoc => ({
  id: data.id,
  kind: data.kind as PlanItemDoc['kind'],
  parentId: data.parentId ?? null,
  createdAt: data.createdAt ?? 0,
  endedAt: data.endedAt ?? null,
  archivedAt: data.archivedAt ?? null,
  heldReleasedOn: readHeldReleasedOn(data),
});

export async function openRecord(
  entry: DayRecordDoc,
  read: ReadSealed,
): Promise<OpenRecord> {
  const base = { id: entry.id, dayId: entry.dayId, createdAt: entry.createdAt };
  if (entry.kind === 'proposed') {
    const payload = withLineDefaults(await read<ProposedSealed>(entry.sealed));
    return { ...base, kind: 'proposed', payload };
  }
  if (entry.kind === 'correction') {
    const payload = withLineDefaults(
      await read<CorrectionSealed>(entry.sealed),
    );
    return {
      ...base,
      kind: 'correction',
      supersedesId: entry.supersedesId ?? '',
      payload,
    };
  }
  const payload = withLineDefaults(await read<ConfirmedSealed>(entry.sealed));
  return { ...base, kind: 'confirmed', payload };
}

/** The plan with its sealed fields, which the caller opened (or `null` for a plan written before they existed). */
export function openPlan(
  plan: PlanDoc,
  sealedFields: PlanSealedFields | null,
): OpenPlan {
  const fields: PlanSealedFields = sealedFields ?? {
    currencyCode: DEFAULT_CURRENCY_CODE,
    notifyHour: null,
    notifyTimeZone: null,
    holdsPrompt: null,
    bankBackedSeenAt: null,
    horizonNudgeDismissed: null,
    homePins: null,
  };
  const result: OpenPlan = {
    uid: plan.uid,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    stance: readStance(plan.stance),
    startDate: plan.startDate ?? null,
    trackingPeriods: (plan.trackingPeriods ?? []).map((period) => ({
      ...period,
      linkedFrom: period.linkedFrom ?? null,
    })),
    dirtyFrom: plan.dirtyFrom ?? null,
    notify: plan.notify ?? null,
    sorting: plan.sorting ?? null,
    doneForYouSeenAt: plan.doneForYouSeenAt ?? null,
    keyId: plan.keyId ?? null,
    currencyCode: fields.currencyCode,
    notifyHour: fields.notifyHour ?? null,
    notifyTimeZone: fields.notifyTimeZone ?? null,
    holdsPrompt: fields.holdsPrompt ?? null,
    bankBackedSeenAt: fields.bankBackedSeenAt ?? null,
    horizonNudgeDismissed: fields.horizonNudgeDismissed ?? null,
    homePins: fields.homePins ?? null,
  };
  return result;
}

export async function openCard(
  data: CardDoc & { id: string },
  read: ReadSealed,
): Promise<OpenCard> {
  const payload = await read<CardSealed>(data.sealed);
  return {
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt ?? null,
    linkId: data.linkId ?? null,
    issuer: payload.issuer,
    name: payload.name ? cleanBankName(payload.name) : null,
    dueDay: payload.dueDay ?? null,
    lastFour: payload.lastFour ?? null,
    payFromAccountId: payload.payFromAccountId ?? null,
    annualFee: payload.annualFee ?? null,
  };
}

export async function openAccount(
  data: AccountDoc & { id: string },
  read: ReadSealed,
): Promise<OpenAccount> {
  const payload = await read<Partial<AccountSealed>>(data.sealed);
  return {
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt ?? null,
    linkId: data.linkId ?? null,
    name: cleanBankName(payload.name ?? ''),
    institution: payload.institution ?? '',
    kind: payload.kind ?? 'checking',
    countedTowardTotal: payload.countedTowardTotal ?? false,
    isPullAccount: payload.isPullAccount ?? false,
    lastFour: payload.lastFour ?? null,
    balanceCents: payload.balanceCents ?? null,
    balanceOn: payload.balanceOn ?? null,
    holds: payload.holds ?? [],
    apyBps: payload.apyBps ?? null,
    interestDay: payload.interestDay ?? null,
  };
}

export async function openAccountBalance(
  data: AccountBalanceDoc,
  read: ReadSealed,
): Promise<OpenAccountBalance> {
  const payload = await read<{
    cents: number;
    availableCents?: number | null;
    limitCents?: number | null;
    hasInstantBalance?: boolean | null;
  }>(data.sealed);
  return {
    id: data.id,
    asOf: data.asOf,
    cents: payload.cents,
    availableCents: payload.availableCents ?? null,
    limitCents: payload.limitCents ?? null,
    hasInstantBalance: payload.hasInstantBalance ?? null,
  };
}

export async function openStartedPayment(
  data: StartedPaymentDoc,
  read: ReadSealed,
): Promise<OpenStartedPayment> {
  const payload = await read<StartedPaymentSealed>(data.sealed);
  return {
    id: data.id,
    cardId: data.cardId,
    startedOn: data.startedOn,
    createdAt: data.createdAt,
    amountCents: payload.amountCents,
  };
}
