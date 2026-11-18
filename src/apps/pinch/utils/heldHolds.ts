import type { DocumentData } from 'firebase/firestore';

import { buildHolds, type ProjectedWrite } from '@/lib/firebase/heldHolds';
import { PINCH_HELD_KINDS } from '@apps/pinch/store/heldLists';

const KINDS = new Set<string>(PINCH_HELD_KINDS);

/** The kind and id of the person's own kitchen record in a collection a listener list reads; anything else is never held. */
export const readPinchTarget = (
  segments: string[],
  uid: string | null,
): { kind: string; id: string } | null => {
  const [apps, pinch, kitchens, owner, collection, id, ...rest] = segments;
  if (apps !== 'apps' || pinch !== 'pinch' || kitchens !== 'kitchens') {
    return null;
  }
  if (owner !== uid || id === undefined || rest.length > 0) return null;
  return KINDS.has(collection) ? { kind: collection, id } : null;
};

export const buildPinchHolds = (
  docs: readonly ProjectedWrite[],
  uid: string,
  token: string,
  open?: (kind: string, data: DocumentData) => DocumentData,
) =>
  buildHolds(docs, (segments) => readPinchTarget(segments, uid), token, open);
