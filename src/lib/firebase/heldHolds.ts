import type { DocumentData } from 'firebase/firestore';

import type { ProjectedDoc } from '@/lib/firebase/projectWrites';
import { toFingerprint, toHeldWrite, type HeldWrite } from '@/utils/heldWrites';

export type ProjectedWrite =
  ProjectedDoc | { segments: string[]; isUnknown: true };

type Fields = { [key: string]: unknown };

const changedFields = (before: Fields | null, after: Fields): string[] =>
  Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after)]),
  ).filter(
    (key) =>
      before === null ||
      toFingerprint(before[key]) !== toFingerprint(after[key]),
  );

const holdOf = (
  kind: string,
  id: string,
  before: DocumentData | null,
  after: DocumentData | null,
  token: string,
  open: (kind: string, data: DocumentData) => DocumentData,
) => {
  if (after === null) return toHeldWrite<unknown>(id, null, [], token);
  const opened = open(kind, { ...after, id });
  const openedBefore = before === null ? null : open(kind, { ...before, id });
  const fields = changedFields(openedBefore, opened);
  return fields.length === 0
    ? null
    : toHeldWrite<unknown>(
        id,
        opened,
        fields,
        token,
        openedBefore !== null,
        openedBefore,
      );
};

/** Each listed record a transaction changed, as its listener would read it, by kind; null when any of them can't be worked out, so none is held. */
export const buildHolds = (
  docs: readonly ProjectedWrite[],
  readTarget: (segments: string[]) => { kind: string; id: string } | null,
  token: string,
  open: (kind: string, data: DocumentData) => DocumentData = (_kind, data) =>
    data,
): Partial<Record<string, HeldWrite<unknown>[]>> | null => {
  const targets = docs.flatMap((doc) => {
    const target = readTarget(doc.segments);
    return target === null ? [] : [{ ...target, doc }];
  });
  if (targets.some(({ doc }) => 'isUnknown' in doc)) return null;
  return targets.reduce<Partial<Record<string, HeldWrite<unknown>[]>>>(
    (sum, { kind, id, doc }) => {
      const { before, after } = doc as ProjectedDoc;
      if (after === null && before === null) return sum;
      const hold = holdOf(kind, id, before, after, token, open);
      if (hold === null) return sum;
      return { ...sum, [kind]: [...(sum[kind] ?? []), hold] };
    },
    {},
  );
};
