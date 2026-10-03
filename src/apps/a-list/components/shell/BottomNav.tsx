import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, Clapperboard, LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';

import { A_LIST_TAB_LABELS } from '@apps/a-list/constants';
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
          'h-auto w-full flex-col gap-0.5 rounded-none px-0 pt-2.5 pb-2 text-[11px] font-medium focus:outline-transparent!',
          isSelected ? 'text-primary!' : 'text-muted-foreground!',
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
      <ul className='mx-auto grid max-w-4xl grid-cols-4 items-end'>
        <li>{renderSideItem('dashboard')}</li>
        <li className='col-span-2 flex justify-center pb-1.5'>
          <Button
            type='button'
            aria-label={A_LIST_TAB_LABELS.calendar}
            aria-current={isCalendarSelected ? 'page' : undefined}
            onClick={() => onChange('calendar')}
            className={join(
              '-mt-5 h-auto flex-col gap-0.5 rounded-2xl px-7 py-2 text-[11px] font-semibold shadow-md',
              !isCalendarSelected && 'opacity-80',
            )}
          >
            <CalendarDays className='h-6 w-6' />
            {A_LIST_TAB_LABELS.calendar}
          </Button>
        </li>
        <li>{renderSideItem('watchlist')}</li>
      </ul>
    </nav>
  );
}

export default BottomNav;
