import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface HeaderIconButtonProps {
  icon: ReactNode;
  /** What it does, as the accessible name and the hover title. */
  label: string;
  onClick: () => void;
  /** Red text and edge, for the one control that throws something away. */
  isDestructive?: boolean;
  isLoading?: boolean;
  isDisabled?: boolean;
  /** A tint for a control whose choice differs from its default. */
  isHighlighted?: boolean;
  /** Set on a control that opens a panel, so a screen reader hears whether it is open. */
  isExpanded?: boolean;
  /** A ghost icon with no fill, for a dashboard header. */
  isQuiet?: boolean;
}

/** A quiet 28px round icon in a header's action cluster with a 40×40 tap area. Its neighbours sit `gap-3` apart, so the areas meet without overlapping. */
function HeaderIconButton({
  icon,
  label,
  onClick,
  isDestructive = false,
  isLoading = false,
  isDisabled = false,
  isHighlighted = false,
  isExpanded,
  isQuiet = false,
}: HeaderIconButtonProps) {
  return (
    <Button
      type='button'
      variant={isQuiet ? 'tertiary' : 'secondary'}
      size='sm'
      rounded='full'
      className={join(
        "relative size-7 p-0 after:absolute after:-inset-1.5 after:content-['']",
        isDestructive &&
          'border-destructive/60 text-destructive! hover:bg-destructive/10',
        isHighlighted && 'bg-accent!',
        isQuiet && 'text-muted-foreground',
      )}
      aria-label={label}
      aria-expanded={isExpanded}
      title={label}
      loading={isLoading}
      disabled={isDisabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

export default HeaderIconButton;
