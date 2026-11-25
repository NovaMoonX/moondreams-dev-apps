// Generated from src/apps/runway/engine/monthEntries.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type {
  DateOnly,
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  PurchaseDoc,
} from '../runwayTypes.js';

import type { ClosingEntries } from './closings.js';
import {
  openMove,
  openPurchase,
  openRecord,
  type ReadSealed,
} from './openDocs.js';

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

/** The move kinds a closing sums; the rest are read from their own records or not at all. */
export const CLOSING_MOVE_KINDS: readonly string[] = [
  'billPaid',
  'cardPayment',
  'transfer',
  'costPaid',
];

/**
 * Opens one month of the ledger into what a closing sums. The phone and the server both call this, each with
 * its own Firestore SDK's documents and its own way of opening a sealed payload, so they always sum the same.
 */
export async function openMonthEntries(
  docs: MonthDocs,
  read: ReadSealed,
  startDate: DateOnly,
  billIds: ReadonlySet<string>,
): Promise<ClosingEntries> {
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
                read,
              ),
            ),
          ),
        ),
    ),
    Promise.all(
      docs.moves
        .map((entry) => ({ ...(entry.data() as MoveDoc), id: entry.id }))
        .filter((entry) => CLOSING_MOVE_KINDS.includes(entry.kind))
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
