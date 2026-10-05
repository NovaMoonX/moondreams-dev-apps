import { useEffect, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import PurchaseReturnPrompt from '@apps/a-list/components/viewing/PurchaseReturnPrompt';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  recordTicket,
  setPurchaseStarted,
} from '@apps/a-list/store/actions/viewingActions';
import { selectPendingPurchaseReturns } from '@apps/a-list/store/selectors';
import type { Ticket } from '@apps/a-list/types';

/** Asks about one purchase at a time, once the member is back from AMC (or opens the app later). Mounted by the seen-prompt host so the two never show together. */
function PurchaseReturnHost() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { overlay } = useAListOverlay();
  const pending = useAppSelector(selectPendingPurchaseReturns);
  // "Not yet" lasts until the next time the app is opened, so it's plain component state.
  const [laterIds, setLaterIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [returnedAt, setReturnedAt] = useState(0);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        setReturnedAt(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () =>
      document.removeEventListener('visibilitychange', handleVisible);
  }, []);

  // Leaving starts the clock: a purchase started before this tab opened, or before the member last came back to it, is ready to ask about.
  const current =
    pending.find(
      (viewing) =>
        !laterIds.includes(viewing.id) &&
        (viewing.purchase?.startedAt ?? Number.POSITIVE_INFINITY) <
          Math.max(openedAt, returnedAt),
    ) ?? null;

  if (!user || !current || overlay !== null) {
    return null;
  }

  const runSave = async (action: () => Promise<unknown>, fallback: string) => {
    setIsSaving(true);
    try {
      await action();
    } catch (error) {
      addToast({ title: getErrorMessage(error, fallback), type: 'error' });
      setLaterIds((ids) => [...ids, current.id]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = (ticket: Ticket) =>
    runSave(async () => {
      await dispatch(
        recordTicket({ uid: user.uid, id: current.id, ticket }),
      ).unwrap();
      addToast({ title: 'Ticket saved', description: current.movie.title });
    }, 'Unable to save this ticket.');

  const handleDidNotBuy = () =>
    runSave(
      () =>
        dispatch(
          setPurchaseStarted({
            uid: user.uid,
            id: current.id,
            startedAt: null,
          }),
        ).unwrap(),
      'Unable to update this showing.',
    );

  return (
    <PurchaseReturnPrompt
      key={current.id}
      viewing={current}
      isSaving={isSaving}
      onLater={() => setLaterIds((ids) => [...ids, current.id])}
      onDidNotBuy={() => void handleDidNotBuy()}
      onSave={(ticket) => void handleSave(ticket)}
    />
  );
}

export default PurchaseReturnHost;
