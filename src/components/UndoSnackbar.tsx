import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import type { PendingUndo } from '@/hooks/useUndoRemoval';

const FOOTER_GAP_PX = 12;
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
}

function SnackbarBar({ pending, onUndo }: SnackbarBarProps) {
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
      className='bg-foreground text-background fixed inset-x-4 z-50 mx-auto flex max-w-md items-center gap-1 rounded-2xl py-1 pr-1 pl-4 shadow-lg motion-safe:animate-[snackbar-in_160ms_ease-out]'
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
        className='text-background! bg-background/15 hover:bg-background/25 h-10 shrink-0 px-3! font-semibold whitespace-nowrap tabular-nums'
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
}

/** A bar with the seconds left to undo a removal, floating above a pinned form footer; keep it mounted so screen readers hear the message. */
function UndoSnackbar({ pending, onUndo }: UndoSnackbarProps) {
  return (
    <>
      <div role='status' aria-live='polite' className='sr-only'>
        {pending
          ? `${pending.message}. You can undo it for a few seconds.`
          : ''}
      </div>
      {pending && <SnackbarBar pending={pending} onUndo={onUndo} />}
    </>
  );
}

export default UndoSnackbar;
