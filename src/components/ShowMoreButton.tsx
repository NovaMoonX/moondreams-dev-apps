import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ShowMoreButtonProps {
  children: ReactNode;
  onClick: () => void;
  /** The list is open: the label names the way back ("Show fewer") and the chevron points up. */
  isOpen?: boolean;
  isLoading?: boolean;
}

/** The one fold under a list that can grow: a quiet left-aligned row with a chevron, never an underlined link. */
function ShowMoreButton({
  children,
  onClick,
  isOpen = false,
  isLoading = false,
}: ShowMoreButtonProps) {
  const Chevron = isOpen ? ChevronUp : ChevronDown;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 justify-start gap-1 px-0!'
      aria-expanded={isOpen}
      loading={isLoading}
      onClick={onClick}
    >
      {children}
      <Chevron className='text-muted-foreground h-4 w-4' aria-hidden='true' />
    </Button>
  );
}

export default ShowMoreButton;
