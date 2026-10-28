import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, Home, ListChecks, Wallet } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import LevelGate from '@apps/runway/components/LevelGate';
import { RUNWAY_TAB_LABELS, RUNWAY_TABS } from '@apps/runway/constants';
import type { RunwayTab } from '@apps/runway/types';

interface RunwayBottomNavProps {
  value: RunwayTab;
  onChange: (value: RunwayTab) => void;
}

const TAB_ICONS: Record<RunwayTab, ReactNode> = {
  home: <Home className='h-5 w-5' />,
  days: <CalendarDays className='h-5 w-5' />,
  spend: <Wallet className='h-5 w-5' />,
  plan: <ListChecks className='h-5 w-5' />,
};

function RunwayBottomNav({ value, onChange }: RunwayBottomNavProps) {
  return (
    <nav
      aria-label='Runway sections'
      data-bottom-bar=''
      className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur'
    >
      <ul className='mx-auto grid max-w-md auto-cols-fr grid-flow-col px-3 py-1.5'>
        {RUNWAY_TABS.map((tab) => {
          const isSelected = value === tab;
          const item = (
            <li className='flex justify-center'>
              <Button
                type='button'
                variant='tertiary'
                aria-label={RUNWAY_TAB_LABELS[tab]}
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => onChange(tab)}
                className={join(
                  'h-auto min-w-18 flex-col gap-0.5 px-3 py-2 text-[11px] font-medium focus:outline-transparent!',
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
          return tab === 'spend' ? (
            <LevelGate key={tab} level='track'>
              {item}
            </LevelGate>
          ) : (
            <Fragment key={tab}>{item}</Fragment>
          );
        })}
      </ul>
    </nav>
  );
}

export default RunwayBottomNav;
