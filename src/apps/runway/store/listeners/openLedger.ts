import type { ClosingEntries } from '@apps/runway/engine/closings';
import { createSealedReader, type EncryptedFieldPayload } from '@lib/security';
import { openJson } from '@apps/runway/security';
import {
  openMove,
  openPurchase,
  openRecord as openRecordWith,
  withLineDefaults,
} from '@apps/runway/engine/openDocs';
import type {
  DateOnly,
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  PurchaseDoc,
  RunwayEncryption,
} from '@apps/runway/types';

export { openMove, openPurchase, withLineDefaults };

export const openRecord = (entry: DayRecordDoc, encryption: RunwayEncryption) =>
  openRecordWith(entry, <T extends object>(sealed: EncryptedFieldPayload) =>
    openJson<T>(sealed, encryption),
  );

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
  const read = createSealedReader(encryption, openJson);
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
          (entry) =>
            entry.kind === 'billPaid' ||
            entry.kind === 'cardPayment' ||
            entry.kind === 'transfer' ||
            entry.kind === 'costPaid',
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
