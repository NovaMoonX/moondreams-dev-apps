import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface SideTabProps {
  side: 'left' | 'right';
  /** The tab's accessible name, whatever it draws. */
  label: string;
  icon: ReactNode;
  /** Sits above open sheets and drawers; every other tab stays beneath them. */
  isAboveSheets?: boolean;
  /** Position (`top-*`), tone and width; the 40px height and the edge shape are the tab's own. */
  className?: string;
  onClick: () => void;
  children?: ReactNode;
}

/** A small tab pinned to a screen edge, 40px tall with a 40px hit area reaching into the page. */
function SideTab({
  side,
  label,
  icon,
  isAboveSheets = false,
  className,
  onClick,
  children,
  ...props
}: SideTabProps) {
  return (
    <Button
      {...props}
      onClick={onClick}
      type='button'
      variant='base'
      size='sm'
      aria-label={label}
      className={join(
        "fixed flex h-10 items-center justify-center border p-0 shadow-md before:absolute before:inset-y-0 before:content-['']",
        isAboveSheets ? 'z-[125]' : 'z-40',
        side === 'left'
          ? 'left-0 rounded-l-none rounded-r-xl border-l-0 before:-right-2 before:left-0'
          : 'right-0 rounded-l-xl rounded-r-none border-r-0 before:right-0 before:-left-2',
        className,
      )}
    >
      {icon}
      {children}
    </Button>
  );
}

export default SideTab;
