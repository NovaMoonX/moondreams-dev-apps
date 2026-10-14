import { ListChecks } from 'lucide-react';

import { useAppSelector } from '@/store';
import EntryRow from '@apps/pinch/components/shared/EntryRow';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectShoppingOpenCount } from '@apps/pinch/store/selectors';

interface ShoppingEntryProps {
  className?: string;
}

/** Reads the count itself, so a tick on the list re-renders this row and not the screen it sits on. */
function ShoppingEntry({ className }: ShoppingEntryProps) {
  const { openSubview } = usePinchOverlay();
  const openCount = useAppSelector(selectShoppingOpenCount);

  return (
    <EntryRow
      icon={<ListChecks className='h-4 w-4' />}
      label='Shopping list'
      count={openCount}
      onClick={() => openSubview({ kind: 'shopping' })}
      className={className}
    />
  );
}

export default ShoppingEntry;
