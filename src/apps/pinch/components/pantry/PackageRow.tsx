import { memo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import {
  PACKAGE_PLACE_EMOJIS,
  PACKAGE_PLACE_LABELS,
} from '@apps/pinch/constants';
import type { Package } from '@apps/pinch/types';
import {
  getOpenedDays,
  getPackageLabel,
  getPackageState,
} from '@apps/pinch/utils/packages';
import { formatSize } from '@apps/pinch/utils/productFormat';

interface PackageRowProps {
  pkg: Package;
  /** The ingredient's name, for a package that stands alone in a list, where the row has no chip; a package under its ingredient's own heading leaves it out and leads with its place's emoji. */
  title?: string;
  /** The person's window for "due soon". */
  soonDays: number;
  onOpen?: (pkg: Package) => void;
  /** Pick-several mode: the row carries a tick and a tap ticks it. */
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggle?: (pkg: Package) => void;
  /** Indents a package that sits under its ingredient's heading in pick-several mode. */
  isNested?: boolean;
}

const getOpenedText = (pkg: Package) => {
  const days = getOpenedDays(pkg);
  if (days === null) return null;
  if (days === 0) return 'Opened today';
  return days === 1 ? 'Opened yesterday' : `Opened ${days} days ago`;
};

function PackageRow({
  pkg,
  title,
  soonDays,
  onOpen,
  isSelecting = false,
  isSelected = false,
  onToggle,
  isNested = false,
}: PackageRowProps) {
  const state = getPackageState(pkg.expiresAt, undefined, soonDays);
  const label = getPackageLabel(pkg.expiresAt);
  const opened = getOpenedText(pkg);
  const amountText = formatSize(pkg.amount, pkg.unit);
  const placeText = PACKAGE_PLACE_LABELS[pkg.place];

  const chip = title === undefined && (
    <span
      className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
      aria-hidden='true'
    >
      {PACKAGE_PLACE_EMOJIS[pkg.place]}
    </span>
  );
  const text = (
    <span className='min-w-0 flex-1'>
      <span className='text-foreground block font-medium wrap-break-word'>
        {title ?? amountText}
      </span>
      <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal'>
        {title !== undefined && (
          <span className='whitespace-nowrap'>{amountText}</span>
        )}
        <span className='whitespace-nowrap'>{placeText}</span>
        {state === 'PAST' || state === 'SOON' ? (
          <EatByBadge state={state} label={label ?? ''} />
        ) : (
          <span className='whitespace-nowrap'>{label ?? 'No date'}</span>
        )}
        {opened !== null && <span className='whitespace-nowrap'>{opened}</span>}
      </span>
    </span>
  );

  if (isSelecting) {
    return (
      <label
        className={join(
          'flex min-h-14 w-full cursor-pointer items-start gap-3 py-2 select-none',
          isNested && 'pl-8',
        )}
      >
        <span className='mt-0.5 inline-flex shrink-0'>
          <Checkbox
            aria-label={`${title ?? amountText}, ${placeText}${label === null ? '' : `, ${label}`}`}
            checked={isSelected}
            onCheckedChange={() => onToggle?.(pkg)}
          />
        </span>
        {!isNested && chip}
        {text}
      </label>
    );
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen?.(pkg)}
      className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
    >
      {chip}
      {text}
      <ChevronRight
        className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default memo(PackageRow);
