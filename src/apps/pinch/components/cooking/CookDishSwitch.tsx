import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface CookDish {
  id: string;
  title: string;
  /** Where that recipe was left ("Step 2 of 4"); the dish on screen says it under its step instead. */
  status: string;
}

interface CookDishSwitchProps {
  dishes: CookDish[];
  value: string;
  onChange: (id: string) => void;
}

/** The plate's recipes as small cards that say where each one is, so switching dishes never reads as a filter. */
function CookDishSwitch({ dishes, value, onChange }: CookDishSwitchProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !card) {
      return;
    }
    const left = card.offsetLeft - list.offsetLeft;
    const isHidden =
      left < list.scrollLeft ||
      left + card.offsetWidth > list.scrollLeft + list.clientWidth;
    if (isHidden) {
      list.scrollTo({ left: left - 16 });
    }
  }, [value]);

  return (
    <div
      ref={listRef}
      role='group'
      aria-label='Dishes'
      className='-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4'
    >
      {dishes.map((dish) => {
        const isShown = dish.id === value;
        return (
          <Button
            key={dish.id}
            type='button'
            variant='tertiary'
            aria-pressed={isShown}
            aria-label={isShown ? dish.title : `${dish.title}, ${dish.status}`}
            className={join(
              'text-foreground! h-auto min-h-13 snap-start flex-col items-start justify-center gap-0 rounded-2xl border px-3 py-1.5 text-left font-normal',
              dishes.length > 2
                ? 'w-[42%] flex-none sm:w-auto sm:min-w-40 sm:flex-1 sm:basis-0'
                : 'min-w-0 flex-1 basis-0',
              '[@media(max-height:500px)]:min-h-10 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-center [@media(max-height:500px)]:justify-start [@media(max-height:500px)]:gap-2',
              isShown
                ? 'bg-background border-[var(--pinch-drizzle)] shadow-[inset_0_0_0_0.5px_var(--pinch-drizzle)]'
                : 'border-border bg-muted/50 hover:bg-muted',
            )}
            onClick={() => onChange(dish.id)}
          >
            <span className='block w-full min-w-0 truncate text-sm font-medium [@media(max-height:500px)]:w-auto'>
              {dish.title}
            </span>
            {!isShown && (
              <span className='text-muted-foreground block text-xs whitespace-nowrap'>
                {dish.status}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export default CookDishSwitch;
