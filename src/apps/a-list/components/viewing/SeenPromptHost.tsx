import { useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import PurchaseReturnHost from '@apps/a-list/components/viewing/PurchaseReturnHost';
import SeenPrompt from '@apps/a-list/components/viewing/SeenPrompt';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  markViewingSeen,
  removeViewing,
} from '@apps/a-list/store/actions/viewingActions';
import { selectPendingSeenPrompts } from '@apps/a-list/store/selectors';

/** Asks about one ended showing at a time, and only while nothing else is open. */
function SeenPromptHost() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { overlay } = useAListOverlay();
  const now = useNow();
  const pending = useAppSelector((state) =>
    selectPendingSeenPrompts(state, now),
  );
  // "Later" lasts until the next time the app is opened, so it's plain component state.
  const [laterIds, setLaterIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const current =
    pending.find((viewing) => !laterIds.includes(viewing.id)) ?? null;

  const handleSeen = async (rating: number | null) => {
    if (!user || !current) {
      return;
    }

    setIsSaving(true);
    try {
      await dispatch(
        markViewingSeen({ uid: user.uid, id: current.id, rating }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: getErrorMessage(error, 'Unable to mark this movie seen.'),
      });
      setLaterIds((ids) => [...ids, current.id]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDidNotGo = async () => {
    if (!user || !current) {
      return;
    }

    const confirmed = await confirm({
      title: 'Remove showing',
      message: `Remove ${current.movie.title}? It stays on your watchlist.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(removeViewing({ uid: user.uid, id: current.id })).unwrap();
    } catch (error) {
      addToast({
        title: getErrorMessage(error, 'Unable to remove this showing.'),
      });
      setLaterIds((ids) => [...ids, current.id]);
    }
  };

  const isSeenPromptShowing = Boolean(user && current && overlay === null);

  // The purchase question stays mounted, so its snooze and return tracking survive a seen prompt coming and going.
  return (
    <>
      {isSeenPromptShowing && current && (
        <SeenPrompt
          key={current.id}
          viewing={current}
          isSaving={isSaving}
          onLater={() => setLaterIds((ids) => [...ids, current.id])}
          onDidNotGo={() => void handleDidNotGo()}
          onSeen={(rating) => void handleSeen(rating)}
        />
      )}
      <PurchaseReturnHost isSuppressed={isSeenPromptShowing} />
    </>
  );
}

export default SeenPromptHost;
