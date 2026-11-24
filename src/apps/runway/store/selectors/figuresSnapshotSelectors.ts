import type { RootState } from '@/store';
import {
  isSnapshotUsable,
  type OpenFiguresSnapshot,
} from '@apps/runway/utils/figuresSnapshot';

/** The server's stored figures when they still describe this plan today and nothing written on this phone is newer; otherwise null. */
export const selectUsableSnapshot = (
  state: RootState,
  today: number,
): OpenFiguresSnapshot | null => {
  const { plan } = state.runway;
  const snapshot = state.runway.figuresSnapshot ?? null;
  return isSnapshotUsable(snapshot, {
    today,
    planUpdatedAt: plan?.updatedAt ?? null,
    lastWriteAt: state.runway.lastWriteAt ?? null,
  })
    ? snapshot
    : null;
};
