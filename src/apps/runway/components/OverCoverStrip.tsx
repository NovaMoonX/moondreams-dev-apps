import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import LockedButton from '@/components/LockedButton';
import { useAuth } from '@/hooks/useAuth';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import { MOVE_WORDS, OVER_FIX_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useUndoTransfer } from '@apps/runway/hooks/useUndoTransfer';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveLeftover,
  newTransferMoveId,
} from '@apps/runway/store/actions/transferActions';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import type { Cents } from '@apps/runway/types';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

interface OverCoverStripProps {
  itemId: string;
  name: string;
  /** What the envelope holds now; the strip is drawn only below zero. */
  heldCents: Cents;
  /** No next-fill row above it, so it is the box's only line. */
  isAlone: boolean;
}

/** The quiet choice under an overspent envelope's next fill: one tap moves the overspend in from Free to Spend (with an Undo), or a lock says why Free to Spend can't. */
function OverCoverStrip({
  itemId,
  name,
  heldCents,
  isAlone,
}: OverCoverStripProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const undoMove = useUndoTransfer();
  const free = useAppSelector((state) =>
    getFreeToSpendFigure(selectBalances(state)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (heldCents >= 0) return null;

  const overCents = -heldCents;
  const over = formatCents(overCents);
  const canCover = free.kind === 'amount' && free.cents >= overCents;
  const lockedText =
    free.kind === 'unknown'
      ? OVER_FIX_WORDS.lockedUnknown
      : free.kind === 'over'
        ? OVER_FIX_WORDS.lockedOver(formatCents(free.cents))
        : OVER_FIX_WORDS.lockedShort(formatCents(free.cents), over);

  const getLead = () => {
    if (!canCover) return OVER_FIX_WORDS.lockedTitle;
    return isAlone ? OVER_FIX_WORDS.leadAlone : OVER_FIX_WORDS.lead;
  };
  const bringBack = async () => {
    if (isSavingRef.current || !user) return;
    if (!navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
    const moveId = newTransferMoveId();
    const undoText = MOVE_WORDS.undone(over, MOVE_WORDS.freeToSpend, name);
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const date = await moveLeftover(user.uid, encryption, {
        moveId,
        fromId: null,
        toId: itemId,
        cents: overCents,
        isOutside: false,
        leftCents: heldCents,
        note: null,
        summary: MOVE_WORDS.summary(over, MOVE_WORDS.freeToSpend, name),
        undoText,
      });
      addToast({
        title: OVER_FIX_WORDS.done(name),
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: MOVE_WORDS.undo,
          onClick: () =>
            void undoMove({
              moveId,
              bill: null,
              cost: null,
              date,
              fromId: null,
              toId: itemId,
              cents: overCents,
              note: null,
              isOutside: false,
              undoText,
            }),
        },
      });
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? MOVE_WORDS.offline
          : getErrorMessage(saveError, MOVE_WORDS.failed),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className={join('px-3 py-2', !isAlone && 'border-border border-t')}>
      <div className='flex items-center gap-3'>
        <p className='text-muted-foreground min-w-0 flex-1 text-[13px]'>
          {getLead()}
        </p>
        {canCover ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='relative shrink-0 after:absolute after:inset-x-0 after:-inset-y-1.5'
            disabled={isSaving}
            onClick={() => void bringBack()}
          >
            {OVER_FIX_WORDS.action}
          </Button>
        ) : (
          <LockedButton
            label={OVER_FIX_WORDS.action}
            title={OVER_FIX_WORDS.lockedTitle}
            size='sm'
            className='relative shrink-0 after:absolute after:inset-x-0 after:-inset-y-1.5'
          >
            <p>{mask(lockedText)}</p>
          </LockedButton>
        )}
      </div>
      {error !== null && (
        <p className='text-destructive mt-1.5 text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default OverCoverStrip;
