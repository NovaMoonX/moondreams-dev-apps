import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, ChefHat, ShoppingBasket } from 'lucide-react';

import { PINCH_TAB_LABELS } from '@apps/pinch/constants';
import type { PinchTab } from '@apps/pinch/types';

interface BottomNavProps {
  value: PinchTab;
  onChange: (value: PinchTab) => void;
}

const SIDE_ICONS: Record<Exclude<PinchTab, 'recipes'>, ReactNode> = {
  calendar: <CalendarDays className='h-5 w-5' />,
  kitchen: <ShoppingBasket className='h-5 w-5' />,
};

function BottomNav({ value, onChange }: BottomNavProps) {
  const renderSideItem = (tab: Exclude<PinchTab, 'recipes'>) => {
    const isSelected = value === tab;

    return (
      <Button
        type='button'
        variant='tertiary'
        aria-label={PINCH_TAB_LABELS[tab]}
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
        {PINCH_TAB_LABELS[tab]}
      </Button>
    );
  };

  const isRecipesSelected = value === 'recipes';

  return (
    <nav
      aria-label='Pinch sections'
      className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur'
    >
      <ul className='mx-auto grid max-w-md grid-cols-3 items-end px-3 pb-2'>
        <li className='flex justify-center pt-2'>
          {renderSideItem('calendar')}
        </li>
        <li className='flex justify-center'>
          {/* The button's own tint is see-through, so a solid surface sits behind it. */}
          <div className='bg-background -mt-6 rounded-3xl'>
            <Button
              type='button'
              variant={isRecipesSelected ? 'primary' : 'secondary'}
              aria-label={PINCH_TAB_LABELS.recipes}
              aria-current={isRecipesSelected ? 'page' : undefined}
              onClick={() => onChange('recipes')}
              className={join(
                'h-auto flex-col gap-1 rounded-3xl! px-8 py-3 text-xs font-semibold shadow-lg',
                isRecipesSelected
                  ? 'ring-primary/25 ring-4'
                  : 'text-muted-foreground!',
              )}
            >
              <ChefHat className='h-7 w-7' />
              {PINCH_TAB_LABELS.recipes}
            </Button>
          </div>
        </li>
        <li className='flex justify-center pt-2'>
          {renderSideItem('kitchen')}
        </li>
      </ul>
    </nav>
  );
}

export default BottomNav;
