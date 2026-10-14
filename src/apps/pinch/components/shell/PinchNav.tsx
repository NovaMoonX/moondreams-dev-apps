import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  CalendarDays,
  ChefHat,
  ListChecks,
  ShoppingBasket,
} from 'lucide-react';

import ShoppingTabBadge from '@apps/pinch/components/shell/ShoppingTabBadge';
import { PINCH_TAB_LABELS, PINCH_TABS } from '@apps/pinch/constants';
import type { PinchTab } from '@apps/pinch/types';

interface PinchNavProps {
  value: PinchTab;
  onChange: (value: PinchTab) => void;
}

const TAB_ICONS: Record<PinchTab, ReactNode> = {
  calendar: <CalendarDays className='h-5 w-5' />,
  recipes: <ChefHat className='h-5 w-5' />,
  kitchen: <ShoppingBasket className='h-5 w-5' />,
  shopping: <ListChecks className='h-5 w-5' />,
};

/** A floating pill at the bottom of a phone, as wide as its four tabs; from `lg` up the same tabs stand in a rail on the left edge. */
function PinchNav({ value, onChange }: PinchNavProps) {
  return (
    <nav
      aria-label='Pinch sections'
      className='pinch-nav fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2 lg:top-1/2 lg:bottom-auto lg:left-4 lg:translate-x-0 lg:-translate-y-1/2'
    >
      <ul className='border-border bg-background flex items-center gap-1 rounded-full border p-1.5 shadow-lg lg:flex-col lg:rounded-3xl'>
        {PINCH_TABS.map((tab) => {
          const isSelected = value === tab;

          return (
            <li key={tab}>
              <Button
                type='button'
                variant='tertiary'
                aria-label={PINCH_TAB_LABELS[tab]}
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => onChange(tab)}
                className={join(
                  'h-auto min-w-16 flex-col gap-0.5 rounded-full! px-2.5! py-2 text-[11px] font-medium focus:outline-transparent! sm:min-w-20 sm:px-4! lg:min-w-16 lg:rounded-2xl!',
                  isSelected
                    ? 'bg-accent text-foreground! font-semibold'
                    : 'text-muted-foreground!',
                )}
              >
                <span
                  className={join(
                    'relative inline-flex',
                    isSelected && 'text-[var(--pinch-drizzle)]',
                  )}
                >
                  {TAB_ICONS[tab]}
                  {tab === 'shopping' && <ShoppingTabBadge />}
                </span>
                {PINCH_TAB_LABELS[tab]}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default PinchNav;
