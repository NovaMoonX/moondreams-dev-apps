import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, type LucideIcon } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { BrowseImportance } from '@apps/helm/screen/views';
import type { HelmView } from '@apps/helm/types';

const VIEW_ENTRIES: Record<HelmView, { label: string; icon: LucideIcon }> = {
  home: { label: 'Home', icon: CalendarDays },
  today: { label: 'Today', icon: CalendarDays },
};

interface BrowseTileProps {
  view: HelmView;
  importance: BrowseImportance;
  /** Spans the row, so a last tile that would sit alone fills it. */
  isWide: boolean;
  onOpen: (view: HelmView) => void;
}

/** One tile of the Browse sheet, sized by how much its view matters. */
function BrowseTile({ view, importance, isWide, onOpen }: BrowseTileProps) {
  const { label, icon: Icon } = VIEW_ENTRIES[view];

  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'helm-card flex h-auto flex-col items-start justify-between gap-3 p-4 text-left',
        isWide && 'col-span-2',
        importance === 'minor' ? 'min-h-20' : 'min-h-28',
      )}
      onClick={() => onOpen(view)}
    >
      <Icon className='text-muted-foreground size-[18px]' aria-hidden='true' />
      <span
        className={join(
          'text-foreground',
          importance === 'minor'
            ? 'text-[15px] font-medium'
            : 'helm-serif text-[22px] leading-7',
        )}
      >
        {label}
      </span>
    </Button>
  );
}

export default BrowseTile;
