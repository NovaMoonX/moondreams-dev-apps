import { useMemo } from 'react';

import { Refrigerator } from 'lucide-react';

import { useAppSelector } from '@/store';
import EntryRow from '@apps/pinch/components/shared/EntryRow';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectContainers,
  selectContainersLoadError,
} from '@apps/pinch/store/selectors';
import {
  getDueText,
  getPlacesText,
  getPreparedSummary,
} from '@apps/pinch/utils/containers';

function PreparedEntry() {
  const { openSubview } = usePinchOverlay();
  const containers = useAppSelector(selectContainers);
  const loadError = useAppSelector(selectContainersLoadError);
  const summary = useMemo(() => getPreparedSummary(containers), [containers]);
  const due = getDueText(summary.soonCount, summary.pastCount);

  const getDetail = () => {
    if (loadError !== null) return "Couldn't load just now";
    if (summary.containerCount === 0) {
      return 'Keep track of what is in your fridge and freezer';
    }
    return getPlacesText(summary);
  };

  return (
    <EntryRow
      icon={<Refrigerator className='h-4 w-4' />}
      label='Prepared meals'
      count={0}
      className='col-span-2'
      detail={
        <>
          <span className='text-muted-foreground block text-xs font-normal wrap-break-word'>
            {getDetail()}
          </span>
          {due !== '' && loadError === null && (
            <span className='text-foreground mt-1 inline-block rounded-full bg-[var(--pinch-drizzle-soft)] px-2 py-0.5 text-xs font-medium ring-1 ring-[var(--pinch-drizzle)]/40 ring-inset'>
              {due}
            </span>
          )}
        </>
      }
      onClick={() => openSubview({ kind: 'containers' })}
    />
  );
}

export default PreparedEntry;
