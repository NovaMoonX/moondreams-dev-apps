import type { DocumentData } from 'firebase/firestore';

import type { ProjectedDoc } from '@/lib/firebase/projectWrites';
import { toFingerprint, toHeldWrite } from '@/utils/heldWrites';
import {
  PINCH_HELD_KINDS,
  type PinchHeldKind,
  type PinchHoldInput,
} from '@apps/pinch/store/heldLists';

type Projected = ProjectedDoc | { segments: string[]; isUnknown: true };

const KINDS = new Set<string>(PINCH_HELD_KINDS);

/** The kind and id of the person's own kitchen record in a collection a listener list reads; anything else is never held. */
const readTarget = (
  segments: string[],
  uid: string,
): { kind: PinchHeldKind; id: string } | null => {
  const [apps, pinch, kitchens, owner, collection, id, ...rest] = segments;
  if (apps !== 'apps' || pinch !== 'pinch' || kitchens !== 'kitchens') {
    return null;
  }
  if (owner !== uid || id === undefined || rest.length > 0) return null;
  return KINDS.has(collection)
    ? { kind: collection as PinchHeldKind, id }
    : null;
};

type Fields = { [key: string]: unknown };

const changedFields = (before: Fields | null, after: Fields): string[] =>
  Object.keys(after).filter(
    (key) =>
      before === null ||
      toFingerprint(before[key]) !== toFingerprint(after[key]),
  );

const holdOf = (
  kind: PinchHeldKind,
  id: string,
  before: DocumentData | null,
  after: DocumentData | null,
  token: string,
  open: (kind: PinchHeldKind, data: DocumentData) => Fields,
) => {
  if (after === null) return toHeldWrite<unknown>(id, null, [], token);
  const opened = open(kind, { ...after, id });
  const fields = changedFields(
    before === null ? null : open(kind, { ...before, id }),
    opened,
  );
  return fields.length === 0
    ? null
    : toHeldWrite<unknown>(id, opened, fields, token);
};

/** Each listed kitchen record a transaction changed, as its listener would read it; null when any of them can't be worked out, so none is held. */
export const buildPinchHolds = (
  docs: readonly Projected[],
  uid: string,
  token: string,
  open: (kind: PinchHeldKind, data: DocumentData) => Fields = (_kind, data) =>
    data,
): PinchHoldInput['writes'] | null => {
  const targets = docs.flatMap((doc) => {
    const target = readTarget(doc.segments, uid);
    return target === null ? [] : [{ ...target, doc }];
  });
  if (targets.some(({ doc }) => 'isUnknown' in doc)) return null;
  return targets.reduce<PinchHoldInput['writes']>((sum, { kind, id, doc }) => {
    const { before, after } = doc as ProjectedDoc;
    if (after === null && before === null) return sum;
    const hold = holdOf(kind, id, before, after, token, open);
    if (hold === null) return sum;
    return { ...sum, [kind]: [...(sum[kind] ?? []), hold] };
  }, {});
};
