import type { ClosingEntries } from '@apps/runway/engine/closings';
import {
  createSealedReader,
  openJson,
  type SealedReader,
} from '@apps/runway/security';
import type {
  BillPaidSealed,
  CardPaymentSealed,
  ConfirmedSealed,
  CorrectionSealed,
  DateOnly,
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  OpenMove,
  OpenPurchase,
  OpenRecord,
  ProposedSealed,
  PurchaseDoc,
  PurchaseSealed,
  RunwayEncryption,
  StartSealed,
  TrackingChangeSealed,
} from '@apps/runway/types';

export async function openMove(
  entry: MoveDoc,
  read: SealedReader,
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
  const payload = await read<BillPaidSealed>(entry.sealed);
  return {
    ...base,
    kind: 'billPaid',
    payload: { ...payload, cardId: payload.cardId ?? null },
  };
}

export async function openRecord(
  entry: DayRecordDoc,
  encryption: RunwayEncryption,
): Promise<OpenRecord> {
  const base = { id: entry.id, dayId: entry.dayId, createdAt: entry.createdAt };
  if (entry.kind === 'proposed') {
    const payload = await openJson<ProposedSealed>(entry.sealed, encryption);
    return { ...base, kind: 'proposed', payload };
  }
  if (entry.kind === 'correction') {
    const payload = await openJson<CorrectionSealed>(entry.sealed, encryption);
    return {
      ...base,
      kind: 'correction',
      supersedesId: entry.supersedesId ?? '',
      payload,
    };
  }
  const payload = await openJson<ConfirmedSealed>(entry.sealed, encryption);
  return { ...base, kind: 'confirmed', payload };
}

export async function openPurchase(
  entry: PurchaseDoc,
  read: SealedReader,
): Promise<OpenPurchase> {
  const payload = await read<PurchaseSealed>(entry.sealed);
  // Before labels, a note with no merchant was what named the row, so it reads as the label.
  const isNoteName = payload.label === undefined && !payload.merchant?.trim();
  const result: OpenPurchase = {
    id: entry.id,
    date: entry.date,
    source: entry.source,
    needsHome: entry.needsHome,
    expenseId: entry.expenseId ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    amountCents: payload.amountCents,
    merchant: payload.merchant ?? null,
    label: isNoteName ? (payload.note ?? null) : (payload.label ?? null),
    note: isNoteName ? null : (payload.note ?? null),
    lines: payload.lines ?? [],
    refundOfId: payload.refundOfId ?? null,
    paidByCardId: payload.paidByCardId ?? null,
    link: payload.link ?? null,
    receiptText: payload.receiptText ?? null,
  };
  return result;
}

/** A document from either Firestore SDK. */
export interface LedgerDoc {
  id: string;
  data(): unknown;
}

/** The documents of one month of the ledger, read by the date each listener reads them by. */
export interface MonthDocs {
  days: readonly LedgerDoc[];
  moves: readonly LedgerDoc[];
  purchases: readonly LedgerDoc[];
  /** The records of one confirmed day. */
  getRecords: (dayId: string) => Promise<readonly LedgerDoc[]>;
}

/** Opens one month of the ledger into what a closing sums. Nothing here knows which Firestore SDK read the documents. */
export async function openMonthEntries(
  docs: MonthDocs,
  encryption: RunwayEncryption,
  startDate: DateOnly,
  billIds: ReadonlySet<string>,
): Promise<ClosingEntries> {
  const read = createSealedReader(encryption);
  const days = docs.days.map((entry) => ({
    ...(entry.data() as IncomeDayDoc),
    id: entry.id,
  }));
  const [records, moves, purchases] = await Promise.all([
    Promise.all(
      days
        .filter((day) => day.status === 'confirmed')
        .map(async (day) =>
          Promise.all(
            (await docs.getRecords(day.id)).map((entry) =>
              openRecord(
                { ...(entry.data() as DayRecordDoc), id: entry.id },
                encryption,
              ),
            ),
          ),
        ),
    ),
    Promise.all(
      docs.moves
        .map((entry) => ({ ...(entry.data() as MoveDoc), id: entry.id }))
        .filter(
          (entry) => entry.kind === 'billPaid' || entry.kind === 'cardPayment',
        )
        .map((entry) => openMove(entry, read)),
    ),
    Promise.all(
      docs.purchases.map((entry) =>
        openPurchase({ ...(entry.data() as PurchaseDoc), id: entry.id }, read),
      ),
    ),
  ]);
  const result: ClosingEntries = {
    startDate,
    days: days.map((day) => ({
      id: day.id,
      expectedOn: day.expectedOn,
      arrivedOn: day.arrivedOn ?? null,
    })),
    records: records.flat(),
    moves,
    purchases,
    billIds,
  };
  return result;
}
