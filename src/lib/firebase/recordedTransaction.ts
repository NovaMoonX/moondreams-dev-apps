import {
  runTransaction,
  type DocumentData,
  type DocumentReference,
  type SetOptions,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

/** One write a transaction body made, with the document's path split into segments. */
export interface RecordedWrite {
  segments: string[];
  op: 'set' | 'update' | 'delete';
  data: DocumentData | null;
  /** A set with `merge` writes only the fields it names, like an update. */
  isMerge: boolean;
}

const isPlain = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(isPlain);
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(isPlain)
  );
};

/** Whether a write's fields are plain values a device can lay over its copy (no sentinel such as `increment`, no dotted path). */
export const isPlainWrite = (data: DocumentData | null): boolean =>
  data !== null &&
  Object.keys(data).every((key) => !key.includes('.')) &&
  isPlain(data);

const recordingTransaction = (
  transaction: Transaction,
  writes: RecordedWrite[],
): Transaction => {
  const record = (
    ref: DocumentReference,
    op: RecordedWrite['op'],
    data: DocumentData | null,
    isMerge: boolean,
  ) => writes.push({ segments: ref.path.split('/'), op, data, isMerge });
  const recording: Transaction = Object.assign(Object.create(transaction), {
    get: (ref: DocumentReference) => transaction.get(ref),
    set: (ref: DocumentReference, data: DocumentData, options?: SetOptions) => {
      const isMerge =
        options !== undefined &&
        ('merge' in options || 'mergeFields' in options);
      record(ref, 'set', data, isMerge);
      transaction.set(ref, data, options ?? {});
      return recording;
    },
    update: (
      ref: DocumentReference,
      dataOrField: DocumentData | string,
      ...rest: unknown[]
    ) => {
      if (typeof dataOrField === 'string') {
        record(ref, 'update', null, true);
        (transaction.update as (...args: unknown[]) => Transaction)(
          ref,
          dataOrField,
          ...rest,
        );
        return recording;
      }
      record(ref, 'update', dataOrField, true);
      transaction.update(ref, dataOrField);
      return recording;
    },
    delete: (ref: DocumentReference) => {
      record(ref, 'delete', null, false);
      transaction.delete(ref);
      return recording;
    },
  });
  return recording;
};

/**
 * Runs a transaction and hands each attempt's writes to `onWrites` before that attempt commits, so a
 * caller can show them at once (a transaction is not shown by Firestore until the server answers).
 */
export function runRecordedTransaction<T>(
  body: (transaction: Transaction) => Promise<T>,
  onWrites: (writes: RecordedWrite[]) => Promise<void> | void,
): Promise<T> {
  return runTransaction(db, async (transaction) => {
    const writes: RecordedWrite[] = [];
    const result = await body(recordingTransaction(transaction, writes));
    await onWrites(writes);
    return result;
  });
}
