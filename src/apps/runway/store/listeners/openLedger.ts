import type { ClosingEntries } from '@apps/runway/engine/closings';
import {
  openMonthEntries as openMonthEntriesWith,
  type MonthDocs,
} from '@apps/runway/engine/monthEntries';
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
  RunwayEncryption,
} from '@apps/runway/types';

export { openMove, openPurchase, withLineDefaults };
export type { LedgerDoc, MonthDocs } from '@apps/runway/engine/monthEntries';

export const openRecord = (entry: DayRecordDoc, encryption: RunwayEncryption) =>
  openRecordWith(entry, <T extends object>(sealed: EncryptedFieldPayload) =>
    openJson<T>(sealed, encryption),
  );

/** Opens one month of the ledger into what a closing sums, with this device's key. */
export const openMonthEntries = (
  docs: MonthDocs,
  encryption: RunwayEncryption,
  startDate: DateOnly,
  billIds: ReadonlySet<string>,
): Promise<ClosingEntries> =>
  openMonthEntriesWith(
    docs,
    createSealedReader(encryption, openJson),
    startDate,
    billIds,
  );
