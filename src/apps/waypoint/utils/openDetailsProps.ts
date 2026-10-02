import type { KeyboardEvent } from 'react';

export function getOpenDetailsProps(label: string, onOpenDetails: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `Open details for ${label}`,
    onClick: onOpenDetails,
    onKeyDown: (keyEvent: KeyboardEvent<HTMLElement>) => {
      if (keyEvent.target === keyEvent.currentTarget && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) {
        keyEvent.preventDefault();
        onOpenDetails();
      }
    },
  };
}
