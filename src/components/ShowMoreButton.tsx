import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';

interface ShowMoreButtonProps {
  children: ReactNode;
  onClick: () => void;
  /** The list is open: the label names the way back ("Show fewer") and the chevron points up. */
  isOpen?: boolean;
  isLoading?: boolean;
  /** For a section header's action slot ("See all"): right-aligned on the title line, with a chevron that points on to the fuller screen. */
  isHeaderAction?: boolean;
}

/** The one fold under a list that can grow: a quiet 14px left-aligned row with a small chevron, never an underlined link. In a section header it is the "See all" that opens the fuller screen. */
function ShowMoreButton({
  children,
  onClick,
  isOpen = false,
  isLoading = false,
  isHeaderAction = false,
}: ShowMoreButtonProps) {
  const Chevron = isHeaderAction
    ? ChevronRight
    : isOpen
      ? ChevronUp
      : ChevronDown;

  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        "text-muted-foreground! relative h-7 gap-0.5 px-0! text-sm font-normal after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        isHeaderAction ? 'justify-end' : 'justify-start',
      )}
      aria-expanded={isHeaderAction ? undefined : isOpen}
      loading={isLoading}
      onClick={onClick}
    >
      {children}
      <Chevron className='size-3.5' aria-hidden='true' />
    </Button>
  );
}

export default ShowMoreButton;
