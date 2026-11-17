import type { DocumentData } from 'firebase/firestore';

import { toFingerprint } from '@/utils/heldWrites';

export interface ProjectableWrite {
  segments: string[];
  op: 'set' | 'update' | 'delete';
  data: DocumentData | null;
  isMerge: boolean;
}

/** A document's raw data before a transaction's writes and after them; null when it doesn't exist. */
export interface ProjectedDoc {
  segments: string[];
  before: DocumentData | null;
  after: DocumentData | null;
}

const UNKNOWN = Symbol('unknown');
const REMOVE = Symbol('remove');

type Resolved = unknown | typeof UNKNOWN | typeof REMOVE;

const isMap = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  Object.getPrototypeOf(value) === Object.prototype;

// Firestore's sentinels keep `_methodName` through its build; their other fields are renamed, so the payload is found by shape.
const sentinelOf = (
  value: unknown,
): { method: string; payload: unknown } | null => {
  if (value === null || typeof value !== 'object' || isMap(value)) return null;
  const method = (value as { _methodName?: unknown })._methodName;
  if (typeof method !== 'string') return null;
  const payload = Object.entries(value).find(
    ([key]) => key !== '_methodName',
  )?.[1];
  return { method, payload };
};

const resolveSentinel = (
  method: string,
  payload: unknown,
  base: unknown,
): Resolved => {
  if (method === 'deleteField') return REMOVE;
  if (method === 'arrayUnion' && Array.isArray(payload)) {
    const current = Array.isArray(base) ? base : [];
    const seen = new Set(current.map(toFingerprint));
    return [
      ...current,
      ...payload.filter((entry) => !seen.has(toFingerprint(entry))),
    ];
  }
  if (method === 'arrayRemove' && Array.isArray(payload)) {
    const removed = new Set(payload.map(toFingerprint));
    return (Array.isArray(base) ? base : []).filter(
      (entry) => !removed.has(toFingerprint(entry)),
    );
  }
  if (method === 'increment' && typeof payload === 'number') {
    return (typeof base === 'number' ? base : 0) + payload;
  }
  return UNKNOWN;
};

const resolveValue = (value: unknown, base: unknown): Resolved => {
  const sentinel = sentinelOf(value);
  if (sentinel !== null) {
    return resolveSentinel(sentinel.method, sentinel.payload, base);
  }
  if (!isMap(value)) return value;
  return resolveMap(value, isMap(base) ? base : {}, false);
};

const resolveMap = (
  value: Record<string, unknown>,
  base: Record<string, unknown>,
  isMerge: boolean,
): Record<string, unknown> | typeof UNKNOWN =>
  Object.entries(value).reduce<Record<string, unknown> | typeof UNKNOWN>(
    (result, [key, entry]) => {
      if (result === UNKNOWN) return UNKNOWN;
      const resolved =
        isMerge && isMap(entry) && sentinelOf(entry) === null
          ? resolveMap(entry, isMap(base[key]) ? base[key] : {}, true)
          : resolveValue(entry, base[key]);
      if (resolved === UNKNOWN) return UNKNOWN;
      if (resolved === REMOVE) {
        return Object.fromEntries(
          Object.entries(result).filter(([name]) => name !== key),
        );
      }
      return { ...result, [key]: resolved };
    },
    isMerge ? { ...base } : {},
  );

const setPath = (
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> | typeof UNKNOWN => {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    const resolved = resolveValue(value, target[head]);
    if (resolved === UNKNOWN) return UNKNOWN;
    if (resolved === REMOVE) {
      return Object.fromEntries(
        Object.entries(target).filter(([name]) => name !== head),
      );
    }
    return { ...target, [head]: resolved };
  }
  const child = setPath(isMap(target[head]) ? target[head] : {}, rest, value);
  return child === UNKNOWN ? UNKNOWN : { ...target, [head]: child };
};

const applyUpdate = (
  base: DocumentData,
  data: DocumentData,
): DocumentData | typeof UNKNOWN =>
  Object.entries(data).reduce<DocumentData | typeof UNKNOWN>(
    (result, [key, value]) =>
      result === UNKNOWN ? UNKNOWN : setPath(result, key.split('.'), value),
    base,
  );

const applyWrite = (
  current: DocumentData | null | typeof UNKNOWN,
  write: ProjectableWrite,
): DocumentData | null | typeof UNKNOWN => {
  if (write.op === 'delete') return null;
  if (write.data === null) return UNKNOWN;
  if (write.op === 'set' && !write.isMerge) {
    return resolveMap(write.data, {}, false);
  }
  if (current === UNKNOWN) return UNKNOWN;
  if (write.op === 'set') return resolveMap(write.data, current ?? {}, true);
  if (current === null) return UNKNOWN;
  return applyUpdate(current, write.data);
};

/**
 * Each written document's raw data after a transaction's writes, in order, from the data it had before (`undefined` when unknown).
 * One whose result can't be worked out (an unknown base under a partial write, a server timestamp) is marked `isUnknown`.
 */
export function projectWrites(
  writes: readonly ProjectableWrite[],
  baseOf: (path: string) => DocumentData | null | undefined,
): (ProjectedDoc | { segments: string[]; isUnknown: true })[] {
  const docs = writes.reduce<
    Map<
      string,
      {
        segments: string[];
        before: DocumentData | null | typeof UNKNOWN;
        after: DocumentData | null | typeof UNKNOWN;
      }
    >
  >((sum, write) => {
    const path = write.segments.join('/');
    const known = sum.get(path);
    const base = baseOf(path);
    const before = known?.before ?? (base === undefined ? UNKNOWN : base);
    const current = known === undefined ? before : known.after;
    return new Map(sum).set(path, {
      segments: write.segments,
      before,
      after: applyWrite(current, write),
    });
  }, new Map());
  return [...docs.values()].map(({ segments, before, after }) =>
    after === UNKNOWN
      ? { segments, isUnknown: true as const }
      : { segments, before: before === UNKNOWN ? null : before, after },
  );
}
