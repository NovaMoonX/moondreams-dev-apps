import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface CookDish {
  id: string;
  title: string;
  status: string;
}

interface CookDishStripProps {
  dishes: CookDish[];
  value: string;
  onChange: (id: string) => void;
}

function CookDishStrip({ dishes, value, onChange }: CookDishStripProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !button) {
      return;
    }
    const left = button.offsetLeft - list.offsetLeft;
    const isHidden =
      left < list.scrollLeft ||
      left + button.offsetWidth > list.scrollLeft + list.clientWidth;
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
              'text-foreground! h-10 min-w-0 snap-start gap-2 rounded-xl border px-3 text-left font-normal',
              dishes.length > 2
                ? 'max-w-[70%] flex-none sm:max-w-72'
                : 'flex-1 basis-0 justify-start sm:max-w-72',
              isShown
                ? 'bg-background border-[var(--pinch-drizzle)] shadow-[inset_0_0_0_0.5px_var(--pinch-drizzle)]'
                : 'border-border bg-muted/50 hover:bg-muted',
            )}
            onClick={() => onChange(dish.id)}
          >
            <span
              className={join(
                'min-w-0 truncate text-sm',
                isShown && 'font-medium',
              )}
            >
              {dish.title}
            </span>
            {!isShown && (
              <span className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'>
                {dish.status.replace('Step ', '')}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export default CookDishStrip;
