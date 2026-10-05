import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, Clapperboard, LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';

import { A_LIST_TAB_LABELS } from '@apps/a-list/constants';
import PreviewsNudge from '@apps/a-list/components/shell/PreviewsNudge';
import type { AListTab } from '@apps/a-list/types';

interface BottomNavProps {
  value: AListTab;
  onChange: (value: AListTab) => void;
}

const SIDE_ICONS: Record<Exclude<AListTab, 'calendar'>, ReactNode> = {
  dashboard: <LayoutDashboard className='h-5 w-5' />,
  watchlist: <Clapperboard className='h-5 w-5' />,
};

function BottomNav({ value, onChange }: BottomNavProps) {
  const renderSideItem = (tab: Exclude<AListTab, 'calendar'>) => {
    const isSelected = value === tab;

    return (
      <Button
        type='button'
        variant='tertiary'
        aria-label={A_LIST_TAB_LABELS[tab]}
        aria-current={isSelected ? 'page' : undefined}
        onClick={() => onChange(tab)}
        className={join(
          'h-auto flex-col gap-0.5 rounded-2xl! px-5 py-2 text-[11px] font-medium focus:outline-transparent!',
          isSelected
            ? 'bg-secondary text-primary! font-semibold'
            : 'text-muted-foreground!',
        )}
      >
        {SIDE_ICONS[tab]}
        {A_LIST_TAB_LABELS[tab]}
      </Button>
    );
  };

  const isCalendarSelected = value === 'calendar';

  return (
    <nav
      aria-label='A-List sections'
      className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur'
    >
      <ul className='mx-auto grid max-w-md grid-cols-3 items-end px-3 pb-2'>
        <li className='flex justify-center pt-2'>{renderSideItem('dashboard')}</li>
        <li className='relative flex justify-center'>
          <PreviewsNudge />
          {/* The button's own tint is see-through, so a solid surface sits behind it. */}
          <div className='bg-background -mt-6 rounded-3xl'>
            <Button
              type='button'
              variant={isCalendarSelected ? 'primary' : 'secondary'}
              aria-label={A_LIST_TAB_LABELS.calendar}
              aria-current={isCalendarSelected ? 'page' : undefined}
              onClick={() => onChange('calendar')}
              className={join(
                'h-auto flex-col gap-1 rounded-3xl! px-8 py-3 text-xs font-semibold shadow-lg',
                isCalendarSelected
                  ? 'ring-primary/25 ring-4'
                  : 'text-muted-foreground!',
              )}
            >
              <CalendarDays className='h-7 w-7' />
              {A_LIST_TAB_LABELS.calendar}
            </Button>
          </div>
        </li>
        <li className='flex justify-center pt-2'>{renderSideItem('watchlist')}</li>
      </ul>
    </nav>
  );
}

export default BottomNav;
