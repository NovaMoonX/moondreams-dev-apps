import {
  doc,
  getDocFromCache,
  runTransaction,
  type DocumentData,
  type DocumentReference,
  type SetOptions,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { projectWrites, type ProjectedDoc } from '@/lib/firebase/projectWrites';

export interface RecordedWrite {
  segments: string[];
  op: 'set' | 'update' | 'delete';
  data: DocumentData | null;
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

/** What each document the attempt read held, by path; null when it didn't exist. */
export type RecordedReads = Map<string, DocumentData | null>;

const recordingTransaction = (
  transaction: Transaction,
  writes: RecordedWrite[],
  reads: RecordedReads,
): Transaction => {
  const record = (
    ref: DocumentReference,
    op: RecordedWrite['op'],
    data: DocumentData | null,
    isMerge: boolean,
  ) => writes.push({ segments: ref.path.split('/'), op, data, isMerge });
  const recording: Transaction = Object.assign(Object.create(transaction), {
    get: async (ref: DocumentReference) => {
      const snapshot = await transaction.get(ref);
      reads.set(ref.path, snapshot.exists() ? snapshot.data() : null);
      return snapshot;
    },
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

/** Hands each attempt's writes to `onWrites` before it commits, since Firestore shows a transaction only once the server answers; a throw there never stops the commit. */
export function runRecordedTransaction<T>(
  body: (transaction: Transaction) => Promise<T>,
  onWrites: (
    writes: RecordedWrite[],
    reads: RecordedReads,
  ) => Promise<void> | void,
): Promise<T> {
  return runTransaction(db, async (transaction) => {
    const writes: RecordedWrite[] = [];
    const reads: RecordedReads = new Map();
    const result = await body(recordingTransaction(transaction, writes, reads));
    await Promise.resolve()
      .then(() => onWrites(writes, reads))
      .catch((error: unknown) => console.error(error));
    return result;
  });
}

const readCached = (path: string): Promise<DocumentData | null | undefined> =>
  getDocFromCache(doc(db, path)).then(
    (snapshot) => (snapshot.exists() ? snapshot.data() : null),
    () => undefined,
  );

/** Each written document's data after an attempt's writes, from what the attempt read or else the device's cached copy. */
export async function projectRecordedWrites(
  writes: RecordedWrite[],
  reads: RecordedReads,
): Promise<ReturnType<typeof projectWrites>> {
  const unread = Array.from(
    new Set(
      writes
        .map((write) => write.segments.join('/'))
        .filter((path) => !reads.has(path)),
    ),
  );
  const cached = new Map(
    await Promise.all(
      unread.map(async (path) => [path, await readCached(path)] as const),
    ),
  );
  return projectWrites(writes, (path) =>
    reads.has(path) ? reads.get(path) : cached.get(path),
  );
}

export type { ProjectedDoc };
