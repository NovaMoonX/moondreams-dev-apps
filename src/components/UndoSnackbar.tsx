import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { PendingUndo } from '@/hooks/useUndoRemoval';

const FOOTER_GAP_PX = 16;
const DEFAULT_BOTTOM = 'calc(1rem + env(safe-area-inset-bottom))';

const getFooter = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.form-footer'))
    .filter((footer) => {
      const { height, top } = footer.getBoundingClientRect();
      return height > 0 && top < window.innerHeight;
    })
    .at(-1) ?? null;

const getBottom = () => {
  const footer = getFooter();
  const result = footer
    ? `${window.innerHeight - footer.getBoundingClientRect().top + FOOTER_GAP_PX}px`
    : DEFAULT_BOTTOM;
  return result;
};

interface SnackbarBarProps {
  pending: PendingUndo;
  onUndo: () => void;
  isOverSheet: boolean;
}

function SnackbarBar({ pending, onUndo, isOverSheet }: SnackbarBarProps) {
  const [bottom, setBottom] = useState(getBottom);

  useEffect(() => {
    const update = () => setBottom(getBottom());
    const footer = getFooter();
    const observer = footer ? new ResizeObserver(update) : null;
    if (footer) {
      observer?.observe(footer);
    }
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      className={join(
        'bg-foreground text-background fixed inset-x-4 mx-auto flex max-w-md items-center gap-3 rounded-xl p-2 pl-4 shadow-lg motion-safe:animate-[snackbar-in_160ms_ease-out]',
        isOverSheet ? 'z-[105]' : 'z-50',
      )}
      style={{ bottom }}
    >
      <span
        className='line-clamp-2 min-w-0 flex-1 py-1 text-sm break-words'
        aria-hidden='true'
      >
        {pending.message}
      </span>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='text-background! bg-background/15 hover:bg-background/25 h-10 shrink-0 rounded-lg! px-3! font-semibold whitespace-nowrap tabular-nums'
        onClick={onUndo}
      >
        Undo · {pending.secondsLeft}
      </Button>
    </div>
  );
}

interface UndoSnackbarProps {
  pending: PendingUndo | null;
  onUndo: () => void;
  /** For a removal made inside a drawer: the bar is drawn at the page's root so it floats above the drawer, over its own footer, instead of under it. */
  isOverSheet?: boolean;
}

/** A bar with the seconds left to undo a removal, floating above a pinned form footer; keep it mounted so screen readers hear the message. */
function UndoSnackbar({
  pending,
  onUndo,
  isOverSheet = false,
}: UndoSnackbarProps) {
  const bar = pending && (
    <SnackbarBar pending={pending} onUndo={onUndo} isOverSheet={isOverSheet} />
  );

  return (
    <>
      <div role='status' aria-live='polite' className='sr-only'>
        {pending
          ? `${pending.message}. You can undo it for a few seconds.`
          : ''}
      </div>
      {bar && isOverSheet ? createPortal(bar, document.body) : bar}
    </>
  );
}

export default UndoSnackbar;
