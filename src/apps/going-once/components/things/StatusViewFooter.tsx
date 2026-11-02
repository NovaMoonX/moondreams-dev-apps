import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { createPortal } from 'react-dom';

interface StatusViewFooterProps {
  /** The drawer's footer, once it is drawn. */
  footerNode: HTMLElement | null;
  /** Why the button is off; a quiet line above it. */
  note?: string | null;
  /** The reason the change can't go on (a refusal, or the thing changed under the view): the line turns red and the button becomes Done. */
  lockedNote?: string | null;
  onDone: () => void;
  /** The view's one button while it is open. */
  children: ReactNode;
}

/** The pinned footer of a view swapped into the thing's drawer: a note above its one button, which gives way to Done once the change can't go on. */
function StatusViewFooter({
  footerNode,
  note,
  lockedNote = null,
  onDone,
  children,
}: StatusViewFooterProps) {
  if (footerNode === null) return null;
  const text = lockedNote ?? note;
  return createPortal(
    <div className='space-y-2'>
      {text && (
        <p
          role={lockedNote === null ? 'status' : 'alert'}
          className={
            lockedNote === null
              ? 'text-muted-foreground text-sm'
              : 'text-destructive text-sm'
          }
        >
          {text}
        </p>
      )}
      {lockedNote === null ? (
        children
      ) : (
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          onClick={onDone}
        >
          Done
        </Button>
      )}
    </div>,
    footerNode,
  );
}

export default StatusViewFooter;
