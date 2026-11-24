import { useAuth } from '@/hooks/useAuth';
import { formatCents } from '@/utils/moneyUtils';
import { MOVE_WORDS } from '@apps/runway/constants';
import { useUndoTransfer } from '@apps/runway/hooks/useUndoTransfer';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveLeftover,
  newTransferMoveId,
} from '@apps/runway/store/actions/transferActions';

const FREE_NAME = 'Free to Spend';

/** Moves what an envelope is short into it from Free to Spend, dated today, and hands back the way to take it back. */
export function useShortfallMove() {
  const { user } = useAuth();
  const undoMove = useUndoTransfer();
  return async (envelopeId: string, cents: number, name: string) => {
    if (!user) throw new Error('Sign in again to move money.');
    const moveId = newTransferMoveId();
    const money = formatCents(cents);
    const undoText = MOVE_WORDS.undone(money, FREE_NAME, name);
    const date = await moveLeftover(
      user.uid,
      await getRunwayEncryption(user.uid),
      {
        moveId,
        fromId: null,
        toId: envelopeId,
        cents,
        isOutside: false,
        leftCents: 0,
        note: null,
        summary: MOVE_WORDS.summary(money, FREE_NAME, name),
        undoText,
      },
    );
    return () =>
      undoMove({
        moveId,
        bill: null,
        cost: null,
        date,
        fromId: null,
        toId: envelopeId,
        cents,
        note: null,
        isOutside: false,
        undoText,
      });
  };
}
