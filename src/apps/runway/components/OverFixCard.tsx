import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';
import LockedButton from '@/components/LockedButton';
import { NOTICE_ACTION_CLASSES } from '@/components/noticeActionClasses';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
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

interface OverFixCardProps {
  itemId: string;
  name: string;
  /** What the envelope holds now; the card is drawn only below zero. */
  heldCents: Cents;
}

/** An envelope below zero, said apart from its figure, with one tap that moves the overspend in from Free to Spend (with an Undo), or a lock that says why Free to Spend can't. */
function OverFixCard({ itemId, name, heldCents }: OverFixCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const undoMove = useUndoTransfer();
  const free = useAppSelector((state) =>
    getFreeToSpendFigure(selectBalances(state)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (heldCents >= 0) return null;
  if (isHidden) return <NeedsALookRow />;

  const overCents = -heldCents;
  const over = formatCents(overCents);
  const canCover = free.kind === 'amount' && free.cents >= overCents;
  const lockedText =
    free.kind === 'unknown'
      ? OVER_FIX_WORDS.lockedUnknown
      : free.kind === 'over'
        ? OVER_FIX_WORDS.lockedOver(formatCents(free.cents))
        : OVER_FIX_WORDS.lockedShort(formatCents(free.cents), over);

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
    <InlineNotice tone='warning' title={mask(OVER_FIX_WORDS.title(name, over))}>
      {canCover ? (
        <div className='mt-2 space-y-1.5'>
          <Button
            type='button'
            variant='primary'
            size='sm'
            className={NOTICE_ACTION_CLASSES.warning}
            disabled={isSaving}
            onClick={() => void bringBack()}
          >
            {OVER_FIX_WORDS.action}
          </Button>
          <p className='text-[13px]'>{mask(OVER_FIX_WORDS.sub(over))}</p>
        </div>
      ) : (
        <div className='mt-2'>
          <LockedButton
            label={OVER_FIX_WORDS.action}
            title={OVER_FIX_WORDS.lockedTitle}
            size='sm'
            className='border-warning/70! text-warning-foreground! dark:text-warning! bg-transparent!'
          >
            <p>{mask(lockedText)}</p>
          </LockedButton>
        </div>
      )}
      {error !== null && (
        <p className='text-destructive mt-2 text-sm' role='alert'>
          {error}
        </p>
      )}
    </InlineNotice>
  );
}

export default OverFixCard;
