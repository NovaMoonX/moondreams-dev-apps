import { useMemo } from 'react';

import { Package as PackageIcon } from 'lucide-react';

import EntryTile from '@/components/EntryTile';
import { useAppSelector } from '@/store';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectLeadDays,
  selectPackages,
  selectPackagesLoadError,
} from '@apps/pinch/store/selectors';
import { getPantryDueText, getPantrySummary } from '@apps/pinch/utils/packages';

const LABEL = 'Pantry';

/** The way into the pantry, drawn once there is a package in it: the status says what is due in words, and nothing when nothing is. */
function PantryEntry() {
  const { openSubview } = usePinchOverlay();
  const packages = useAppSelector(selectPackages);
  const loadError = useAppSelector(selectPackagesLoadError);
  const soonDays = useAppSelector(selectLeadDays);
  const summary = useMemo(
    () => getPantrySummary(packages, undefined, soonDays),
    [packages, soonDays],
  );
  const due =
    loadError === null
      ? getPantryDueText(summary.soonCount, summary.pastCount)
      : '';

  const getAriaLabel = () => {
    if (loadError !== null) return `${LABEL}, couldn't load just now`;
    const count = `${summary.packageCount} ${summary.packageCount === 1 ? 'package' : 'packages'}`;
    return [`${LABEL}: ${count}`, due].filter((part) => part !== '').join('. ');
  };

  return (
    <EntryTile
      icon={<PackageIcon className='h-4 w-4' />}
      label={LABEL}
      status={due === '' ? undefined : due}
      ariaLabel={getAriaLabel()}
      onClick={() => openSubview({ kind: 'pantry' })}
    />
  );
}

export default PantryEntry;
