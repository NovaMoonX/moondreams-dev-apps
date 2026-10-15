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

const LABEL = 'Fridge & freezer';

function PreparedEntry() {
  const { openSubview } = usePinchOverlay();
  const containers = useAppSelector(selectContainers);
  const loadError = useAppSelector(selectContainersLoadError);
  const summary = useMemo(() => getPreparedSummary(containers), [containers]);
  const due =
    loadError === null ? getDueText(summary.soonCount, summary.pastCount) : '';

  const getAriaLabel = () => {
    if (loadError !== null) return `${LABEL}, couldn't load just now`;
    if (summary.containerCount === 0) return `${LABEL}, nothing put away`;
    return [`${LABEL}: ${getPlacesText(summary)}`, due]
      .filter((part) => part !== '')
      .join('. ');
  };

  return (
    <EntryChip
      icon={<Refrigerator className='h-4 w-4' />}
      label={LABEL}
      note={due === '' ? undefined : due}
      ariaLabel={getAriaLabel()}
      onClick={() => openSubview({ kind: 'containers' })}
    />
  );
}

export default PreparedEntry;
