import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { MOVE_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoTransfer } from '@apps/runway/store/actions/transferActions';
import type { ChangeMove } from '@apps/runway/types';

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Takes one move of money back and toasts the outcome; resolves true when it was undone. */
export function useUndoTransfer() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  return async (moved: Omit<ChangeMove, 'isUndo'>) => {
    if (!user) return false;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoTransfer(user.uid, encryption, moved);
      addToast({ title: mask(moved.undoText), type: 'success' });
      return true;
    } catch (undoError) {
      addToast({
        title: MOVE_WORDS.undoFailed,
        description: isOfflineFailure(undoError)
          ? MOVE_WORDS.offline
          : getErrorMessage(undoError, MOVE_WORDS.failed),
        type: 'error',
      });
      return false;
    }
  };
}
