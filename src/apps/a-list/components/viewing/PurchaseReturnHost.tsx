import { useEffect, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import PurchaseReturnPrompt from '@apps/a-list/components/viewing/PurchaseReturnPrompt';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  recordTicket,
  updateViewing,
} from '@apps/a-list/store/actions/viewingActions';
import { selectPendingPurchaseReturns } from '@apps/a-list/store/selectors';
import type { Ticket } from '@apps/a-list/types';
import { shouldAskAboutPurchase } from '@apps/a-list/utils/purchase';

interface PurchaseReturnHostProps {
  /** True while a seen prompt is up, so the two questions never show together. */
  isSuppressed: boolean;
}

/** Asks about one purchase at a time, once the member is back from AMC or opens the app later. */
function PurchaseReturnHost({ isSuppressed }: PurchaseReturnHostProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { overlay } = useAListOverlay();
  const pending = useAppSelector(selectPendingPurchaseReturns);
  const now = useNow();
  // "Ask me later" lasts until the member next comes back to this tab or reopens the app, so it's plain component state.
  const [laterIds, setLaterIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [returnedAt, setReturnedAt] = useState(0);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        setLaterIds([]);
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
        shouldAskAboutPurchase(viewing, now) &&
        (viewing.purchase?.startedAt ?? Number.POSITIVE_INFINITY) <
          Math.max(openedAt, returnedAt),
    ) ?? null;

  if (!user || !current || overlay !== null || isSuppressed) {
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
          updateViewing({
            uid: user.uid,
            id: current.id,
            showtimeAt: current.showtimeAt,
            runtimeMinutes: current.movie.runtimeMinutes,
            purchase: null,
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
