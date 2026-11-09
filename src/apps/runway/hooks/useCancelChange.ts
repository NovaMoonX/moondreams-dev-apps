import { store } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { COMING_WORDS, PART_OF_WORDS } from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  canCancelChange,
  findLinkHolder,
  getCancelTarget,
} from '@apps/runway/engine/horizonLinks';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { cancelChange } from '@apps/runway/store/actions/itemActions';
import {
  selectAllCards,
  selectAllHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  describeChangeFigures,
  getChangeRef,
} from '@apps/runway/utils/comingChangeText';
import { getCardNamer } from '@apps/runway/utils/cardText';

const readTarget = (change: PlanChange, today: number) => {
  const state = store.getState().runway;
  const item = state.items.find(({ id }) => id === change.itemId);
  return getCancelTarget(
    state.versions,
    { id: change.itemId, endedAt: item?.endedAt ?? null },
    getChangeRef(change).changeId,
    today,
  );
};

/** Whether a coming change can be cancelled now: not started, not a stretch's return, and something left to write. The one place the cancel's input is read. */
export const canCancelComingChange = (change: PlanChange) =>
  canCancelChange(change, todayAsUtcDate()) &&
  readTarget(change, todayAsUtcDate()) !== null;

/** Cancels a coming change, taking its link out of the event that holds it in the same write; false when another device already did. Throws a sentence the sheet shows. */
export function useCancelChange() {
  const { user } = useAuth();

  return async (change: PlanChange): Promise<boolean> => {
    if (!user) return false;
    const today = todayAsUtcDate();
    const target = readTarget(change, today);
    if (target === null) return false;
    const state = store.getState();
    const name = change.after.payload.name;
    const date = formatDateOrdinalUTC(change.on);
    const figures = describeChangeFigures(
      change,
      getCardNamer(selectAllCards(state)),
    );
    const isStop = change.what === 'stop';
    const ref = getChangeRef(change);
    const holder = findLinkHolder(selectAllHorizonItems(state, today), {
      changeId: ref.changeId,
      itemId: change.itemId,
    });
    const eventName = holder?.version.payload.name ?? '';
    return cancelChange(user.uid, await getRunwayEncryption(user.uid), {
      itemId: change.itemId,
      changeId: ref.changeId,
      target,
      today,
      summary: isStop
        ? COMING_WORDS.cancelEntryStop(name)
        : COMING_WORDS.cancelEntry(name, figures ?? 'change', date),
      link:
        holder !== null
          ? {
              eventId: holder.item.id,
              horizon: holder.version.payload,
              baseVersionId: holder.version.id,
              on: today,
              summary: PART_OF_WORDS.cancelledLine(
                name,
                isStop
                  ? `ending after ${formatDateOrdinalUTC(change.on - DAY_MS)}`
                  : (figures ?? 'change'),
                eventName,
              ),
            }
          : null,
    });
  };
}
