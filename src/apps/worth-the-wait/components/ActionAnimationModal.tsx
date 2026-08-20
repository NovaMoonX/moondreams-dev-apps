import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useEffect, useMemo, useState } from 'react';

import { useWorthTheWait } from '../context/worthTheWaitContext';
import { useItems } from '../hooks/useItems';
import { useRaffleReveal } from '../hooks/useRaffleReveal';
import type { ActiveAction, Box, Item } from '../types';
import { getFriendlyRevealMethod } from '../utils/boxHelpers';

interface ActionAnimationModalProps {
  boxes: Box[];
}

const RAFFLE_TICK_MS = 300;

// function getActionPhase(action: ActiveAction, now: number) {
//   if (action.status === 'completed') {
//     return 'complete';
//   }

//   const elapsedMs = Math.max(0, now - action.startedAt);
//   const result =
//     action.status === 'initiating' || elapsedMs < 500
//       ? 'preparing'
//       : 'animating';

//   return result;
// }

function getRaffleItem(items: Item[], action: ActiveAction, now: number) {
  if (action.status === 'completed') {
    const selectedItemId = action.selectedItemIds[0];
    const selectedItem =
      items.find((item) => item.id === selectedItemId) ?? null;

    return selectedItem;
  }

  if (items.length === 0) {
    return null;
  }

  const elapsedMs = Math.max(0, now - action.startedAt);
  const itemIndex = Math.floor(elapsedMs / RAFFLE_TICK_MS) % items.length;
  const item = items[itemIndex] ?? null;

  return item;
}

function getCompletedItems(items: Item[], action: ActiveAction) {
  const selectedItemIds = new Set(action.selectedItemIds);
  const result = items.filter((item) => selectedItemIds.has(item.id));

  return result;
}

function ActionAnimationModal({ boxes }: ActionAnimationModalProps) {
  const { dismissPresentedAction, openBox, presentedAction, space } =
    useWorthTheWait();

  const [now, setNow] = useState(() => Date.now());
  const activeBoxId = presentedAction?.boxId ?? '';
  const { items } = useItems(space?.id ?? '', activeBoxId);

  useEffect(() => {
    if (presentedAction?.method !== 'raffle') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, RAFFLE_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [presentedAction?.method]);

  const targetBox = useMemo(
    () => boxes.find((box) => box.id === presentedAction?.boxId) ?? null,
    [boxes, presentedAction?.boxId],
  );

  // const actionPhase = presentedAction
  //   ? getActionPhase(presentedAction, now)
  //   : null;
  const completedItems = presentedAction
    ? getCompletedItems(items, presentedAction)
    : [];
  const raffleItem = presentedAction
    ? getRaffleItem(items, presentedAction, now)
    : null;

  const raffleReveal = useRaffleReveal({
    content: raffleItem?.content ?? null,
    status: presentedAction?.status,
    completedAt: presentedAction?.completedAt,
    now,
  });

  if (!presentedAction || !targetBox) {
    return null;
  }

  const isCompleted = presentedAction.status === 'completed';

  const raffleDisplayText = raffleReveal?.displayText;
  const isRaffle = presentedAction.method === 'raffle';
  const revealedItemCount = completedItems.length;
  const title = isCompleted
    ? isRaffle
      ? 'The raffle has chosen'
      : 'Your box is open'
    : isRaffle
      ? 'Choosing a shared thought'
      : 'Opening your shared box';

  const handleViewItems = () => {
    dismissPresentedAction();
    openBox(presentedAction.boxId, { openItems: true });
  };

  return (
    <Modal
      isOpen
      onClose={() => undefined}
      contentOnly
      hideCloseButton
      disableCloseOnOverlayClick
    >
      <div className='bg-background/90 border-border bg-card relative w-full max-w-lg overflow-hidden rounded-3xl border p-6 text-center shadow-2xl sm:p-8'>
        <div className='from-primary/20 via-primary/5 pointer-events-none absolute inset-x-0 top-0 h-44 bg-linear-to-b to-transparent' />

        <div className='relative space-y-6'>
          <div className='space-y-2'>
            <span className='text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase'>
              {getFriendlyRevealMethod(presentedAction.method, 'upper')}
            </span>
            <h2
              id='action-animation-title'
              className='text-foreground text-3xl font-semibold tracking-tight'
            >
              {title}
            </h2>
            <p className='text-muted-foreground text-sm'>
              {targetBox.emoji} {targetBox.name}
            </p>
          </div>

          {isRaffle ? (
            <div className='border-border bg-muted/40 flex min-h-44 items-center justify-center rounded-3xl border p-6'>
              <p
                className={join(
                  'text-foreground max-w-sm text-2xl leading-8 font-medium wrap-break-word transition-opacity',
                  !isCompleted && 'animate-pulse',
                )}
              >
                {raffleDisplayText}
              </p>
            </div>
          ) : (
            <div className='relative flex min-h-44 items-center justify-center overflow-hidden rounded-3xl bg-amber-500/10'>
              <span
                className={join(
                  'absolute h-28 w-28 rounded-full bg-amber-300/40',
                  !isCompleted && 'animate-ping',
                )}
              />
              <span
                className={join(
                  'relative text-7xl transition-transform duration-500',
                  isCompleted ? 'scale-110' : 'animate-bounce',
                )}
              >
                {isCompleted ? '✨' : '🫙'}
              </span>
            </div>
          )}

          {isCompleted ? (
            <div className='space-y-3'>
              <p className='text-muted-foreground text-sm'>
                {isRaffle
                  ? 'One item is ready to explore together.'
                  : `${revealedItemCount} item${revealedItemCount === 1 ? '' : 's'} are ready to explore together.`}
              </p>
              <Button
                type='button'
                className='w-full'
                onClick={handleViewItems}
              >
                View items
              </Button>
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              Keep this moment open together. The reveal will finish shortly.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ActionAnimationModal;
