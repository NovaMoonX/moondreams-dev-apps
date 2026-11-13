import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { CONVERT_WORDS } from '@apps/runway/constants';
import { hasLaterHistory } from '@apps/runway/engine/convertItem';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  undoConvertItem,
  type ConvertWritten,
} from '@apps/runway/store/actions/convertActions';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import {
  selectAccounts,
  selectEnvelopes,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

/** Tells the person an envelope became a goal, or a goal an envelope, with an Undo that takes it back while the new one has nothing of its own; `undo` serves a screen that carries the Undo itself. */
export function useConvertItemToast() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();

  const undo = async (written: ConvertWritten): Promise<boolean> => {
    if (!user) return false;
    const state = store.getState();
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const isUndone = await undoConvertItem(user.uid, encryption, {
        ...written,
        newHeldCents:
          selectBalances(state).assignedByItem[written.newItemId] ?? 0,
        hasLaterHistory: hasLaterHistory({
          newItemId: written.newItemId,
          ownMoveId: written.moveId,
          ownChangeId: written.changeId,
          versions: state.runway.versions,
          moves: state.runway.moves,
          purchases: state.runway.purchases,
          changes: state.runway.changes,
        }),
        accountIds: selectAccounts(state).map((account) => account.id),
        liveEnvelopeIds: selectEnvelopes(state, todayAsUtcDate()).map(
          ({ item }) => item.id,
        ),
      });
      if (!isUndone) return false;
      addToast({
        title: mask(
          written.from === 'envelope'
            ? CONVERT_WORDS.undoneGoal(written.name)
            : CONVERT_WORDS.undoneEnvelope(written.name),
        ),
        type: 'success',
      });
      return true;
    } catch (undoError) {
      addToast({
        title: CONVERT_WORDS.undoFailed,
        description: isOfflineFailure(undoError)
          ? CONVERT_WORDS.offline
          : getErrorMessage(undoError, CONVERT_WORDS.failed),
        type: 'error',
      });
      return false;
    }
  };

  const announce = (written: ConvertWritten) =>
    addToast({
      title: mask(
        written.from === 'envelope'
          ? CONVERT_WORDS.nowGoal(written.name)
          : CONVERT_WORDS.nowEnvelope(written.name),
      ),
      type: 'success',
      action: {
        label: CONVERT_WORDS.undo,
        onClick: () => void undo(written),
      },
    });

  return { announce, undo };
}
