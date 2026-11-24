import { ENGINE_VERSION } from '@apps/runway/engine/engineConstants';
import type { FiguresSnapshotSealed } from '@apps/runway/engine/figures';
import type { DateOnly } from '@apps/runway/types';

/** The server's stored figures with their sealed part opened. */
export interface OpenFiguresSnapshot {
  engineVersion: number;
  asOf: DateOnly;
  computedAt: number;
  planStamp: number;
  figures: FiguresSnapshotSealed;
}

/** Whether the stored figures still describe this plan today: same engine, same day, same plan, and no write on this phone since the server worked them out. */
export function isSnapshotUsable(
  snapshot: OpenFiguresSnapshot | null,
  facts: {
    today: DateOnly;
    planUpdatedAt: number | null;
    lastWriteAt: number | null;
  },
) {
  if (snapshot === null || facts.planUpdatedAt === null) return false;
  return (
    snapshot.engineVersion === ENGINE_VERSION &&
    snapshot.asOf === facts.today &&
    snapshot.planStamp === facts.planUpdatedAt &&
    (facts.lastWriteAt === null || snapshot.computedAt > facts.lastWriteAt)
  );
}

const lastWriteKey = (uid: string) => `runway.lastWrite.${uid}`;

export function readLastWriteAt(uid: string) {
  try {
    const value = Number(window.localStorage.getItem(lastWriteKey(uid)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastWriteAt(uid: string, at: number) {
  try {
    window.localStorage.setItem(lastWriteKey(uid), String(at));
  } catch {
    // Storage may be blocked; the in-memory mark still holds for this visit.
  }
}
