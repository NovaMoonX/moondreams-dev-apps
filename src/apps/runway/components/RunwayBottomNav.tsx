import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, Home, ListChecks } from 'lucide-react';
import type { ReactNode } from 'react';

import { RUNWAY_TAB_LABELS, RUNWAY_TABS } from '@apps/runway/constants';
import type { RunwayTab } from '@apps/runway/types';

interface RunwayBottomNavProps {
  value: RunwayTab;
  onChange: (value: RunwayTab) => void;
}

const TAB_ICONS: Record<RunwayTab, ReactNode> = {
  home: <Home className='h-5 w-5' />,
  days: <CalendarDays className='h-5 w-5' />,
  plan: <ListChecks className='h-5 w-5' />,
};

function RunwayBottomNav({ value, onChange }: RunwayBottomNavProps) {
  return (
    <nav
      aria-label='Runway sections'
      className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur'
    >
      <ul className='mx-auto grid max-w-md grid-cols-3 px-3 py-1.5'>
        {RUNWAY_TABS.map((tab) => {
          const isSelected = value === tab;

          return (
            <li key={tab} className='flex justify-center'>
              <Button
                type='button'
                variant='tertiary'
                aria-label={RUNWAY_TAB_LABELS[tab]}
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => onChange(tab)}
                className={join(
                  'h-auto min-w-20 flex-col gap-0.5 px-4 py-2 text-[11px] font-medium focus:outline-transparent!',
                  isSelected
                    ? 'bg-accent text-foreground! font-semibold'
                    : 'text-muted-foreground!',
                )}
              >
                {TAB_ICONS[tab]}
                {RUNWAY_TAB_LABELS[tab]}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default RunwayBottomNav;
