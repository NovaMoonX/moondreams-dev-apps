import type { ReactNode } from 'react';

import { createPortal } from 'react-dom';

interface StatusViewFooterProps {
  /** The drawer's footer, once it is drawn. */
  footerNode: HTMLElement | null;
  /** Why the button is off, or the reason a change was refused; refusals are red. */
  note?: string | null;
  isRefusal?: boolean;
  children: ReactNode;
}

/** The pinned footer of a view swapped into the thing's drawer: a note above its one button. */
function StatusViewFooter({
  footerNode,
  note,
  isRefusal = false,
  children,
}: StatusViewFooterProps) {
  if (footerNode === null) return null;
  return createPortal(
    <div className='space-y-2'>
      {note && (
        <p
          role={isRefusal ? 'alert' : 'status'}
          className={
            isRefusal
              ? 'text-destructive text-sm'
              : 'text-muted-foreground text-sm'
          }
        >
          {note}
        </p>
      )}
      {children}
    </div>,
    footerNode,
  );
}

export default StatusViewFooter;
