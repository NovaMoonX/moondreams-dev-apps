import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface AdminIconButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

/** A ghost round icon for the dashboard's header: no fill, a 40px tap area. */
function AdminIconButton({
  icon,
  label,
  onClick,
  isLoading = false,
  isDisabled = false,
}: AdminIconButtonProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      rounded='full'
      className="text-muted-foreground relative size-7 p-0 after:absolute after:-inset-1.5 after:content-['']"
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

export default AdminIconButton;
