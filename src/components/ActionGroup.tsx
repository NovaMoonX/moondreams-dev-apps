import type { ReactNode } from 'react';

interface ActionGroupProps {
  children: ReactNode;
}

/** One tinted, hairline-edged block for a drawer's related rows (`ActionRow`s with `isGrouped`, or `GroupRow`s); it draws nothing while it has none. */
function ActionGroup({ children }: ActionGroupProps) {
  return (
    <div className='bg-muted/50 border-border divide-border divide-y overflow-hidden rounded-2xl border empty:hidden'>
      {children}
    </div>
  );
}

export default ActionGroup;
