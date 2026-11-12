import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { HORIZON_PLAN_WORDS, MOVE_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  undoEnvelopeIntoHorizon,
  type EnvelopeIntoHorizonWritten,
} from '@apps/runway/store/actions/horizonGoalActions';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';

/** Tells the person an envelope's money moved into an event, with an Undo on the toast that reopens the envelope and takes the money back while the event still holds it. */
export function useEnvelopeIntoHorizonToast() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();

  const undo = async (written: EnvelopeIntoHorizonWritten, event: string) => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const isWritten = await undoEnvelopeIntoHorizon(user.uid, encryption, {
        ...written,
        eventName: event,
        eventHeldCents:
          selectBalances(store.getState()).assignedByItem[
            written.move.toId ?? ''
          ] ?? 0,
      });
      if (isWritten) {
        addToast({ title: mask(written.move.undoText), type: 'success' });
      }
    } catch (undoError) {
      addToast({
        title: MOVE_WORDS.undoFailed,
        description: !navigator.onLine
          ? HORIZON_PLAN_WORDS.offline
          : getErrorMessage(undoError, MOVE_WORDS.failed),
        type: 'error',
      });
    }
  };

  return (
    written: EnvelopeIntoHorizonWritten,
    names: { envelope: string; event: string },
  ) =>
    addToast({
      title: mask(
        HORIZON_PLAN_WORDS.envelopeMoved(
          names.envelope,
          formatCents(written.move.cents),
          names.event,
        ),
      ),
      type: 'success',
      action: {
        label: MOVE_WORDS.undo,
        onClick: () => void undo(written, names.event),
      },
    });
}
