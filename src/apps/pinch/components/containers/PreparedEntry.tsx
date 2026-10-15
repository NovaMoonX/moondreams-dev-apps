import { useMemo } from 'react';

import { Refrigerator } from 'lucide-react';

import EntryChip from '@/components/EntryChip';
import { useAppSelector } from '@/store';
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
  const due =
    loadError === null ? getDueText(summary.soonCount, summary.pastCount) : '';

  const getAriaLabel = () => {
    if (loadError !== null) return "Prepared meals, couldn't load just now";
    if (summary.containerCount === 0) return 'Prepared meals, nothing put away';
    const count = `${summary.containerCount} ${summary.containerCount === 1 ? 'container' : 'containers'}`;
    return [`Prepared meals, ${count}: ${getPlacesText(summary)}`, due]
      .filter((part) => part !== '')
      .join('. ');
  };

  return (
    <EntryChip
      icon={<Refrigerator className='h-4 w-4' />}
      label='Prepared meals'
      count={loadError === null ? summary.containerCount : 0}
      ariaLabel={getAriaLabel()}
      trailing={
        due !== '' && (
          <span
            className='size-2 shrink-0 rounded-full bg-[var(--pinch-drizzle)]'
            aria-hidden='true'
          />
        )
      }
      onClick={() => openSubview({ kind: 'containers' })}
    />
  );
}

export default PreparedEntry;
