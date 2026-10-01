import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, House, ListChecks, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

import TripProgressBar from '@apps/waypoint/components/TripProgressBar';
import type { TripSpace } from '@apps/waypoint/types';

interface TripBottomNavProps {
  trip: TripSpace;
  now: number;
  /** '' is the Overview screen; anything else is a section tab value. */
  value: string;
  showProgress: boolean;
  onChange: (value: string) => void;
}

// Stays and Members live behind Overview, so Overview stays highlighted while on them.
const NAV_ITEMS: { value: string; label: string; icon: ReactNode; matches: string[] }[] = [
  { value: '', label: 'Overview', icon: <House className='h-5 w-5' />, matches: ['', 'stays', 'members'] },
  { value: 'overview', label: 'Timeline', icon: <CalendarDays className='h-5 w-5' />, matches: ['overview'] },
  { value: 'expenses', label: 'Expenses', icon: <Wallet className='h-5 w-5' />, matches: ['expenses'] },
  { value: 'checklist', label: 'Checklist', icon: <ListChecks className='h-5 w-5' />, matches: ['checklist'] },
];

function TripBottomNav({ trip, now, value, showProgress, onChange }: TripBottomNavProps) {
  return (
    <nav
      aria-label='Trip sections'
      className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur'
    >
      {showProgress && (
        <TripProgressBar trip={trip} now={now} className='absolute inset-x-0 top-0 h-0.5' />
      )}
      <ul className='mx-auto grid max-w-4xl grid-cols-4'>
        {NAV_ITEMS.map((item) => {
          const isSelected = item.matches.includes(value);

          return (
            <li key={item.label}>
              <Button
                type='button'
                variant='tertiary'
                aria-label={item.label}
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => onChange(item.value)}
                className={join(
                  'h-auto w-full flex-col gap-0.5 rounded-none px-0 pt-2.5 pb-2 text-[11px] font-medium focus:outline-transparent!',
                  isSelected ? 'text-primary!' : 'text-muted-foreground!',
                )}
              >
                {item.icon}
                {item.label}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default TripBottomNav;
