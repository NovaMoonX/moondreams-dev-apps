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
}

/** A quiet 28px round icon in a header's action cluster with a 40×40 tap area. Its neighbours sit `gap-3` apart, so the areas meet without overlapping. */
function HeaderIconButton({
  icon,
  label,
  onClick,
  isDestructive = false,
  isLoading = false,
  isDisabled = false,
}: HeaderIconButtonProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      className={join(
        "relative size-7 p-0 after:absolute after:-inset-1.5 after:content-['']",
        isDestructive &&
          'border-destructive/60 text-destructive! hover:bg-destructive/10',
      )}
      aria-label={label}
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
