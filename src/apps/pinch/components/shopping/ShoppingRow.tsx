import { memo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import type { Unit } from '@apps/pinch/types';
import { formatSize } from '@apps/pinch/utils/productFormat';

interface ShoppingRowProps {
  id: string;
  name: string;
  amount: number;
  unit: Unit;
  isChecked: boolean;
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
}

/** One thing to buy: a tick on the first line, its name and amount, and a tap anywhere else to change how much. Props are plain values so a tick re-renders only its own row. */
function ShoppingRow({
  id,
  name,
  amount,
  unit,
  isChecked,
  onToggle,
  onOpen,
}: ShoppingRowProps) {
  return (
    <li className='flex items-start gap-3'>
      <span className='mt-2.5 inline-flex shrink-0'>
        <Checkbox
          aria-label={`Got ${name}`}
          checked={isChecked}
          onCheckedChange={(checked) => onToggle(id, checked === true)}
          className="relative after:absolute after:-inset-2.5 after:content-['']"
        />
      </span>
      <Button
        type='button'
        variant='tertiary'
        onClick={() => onOpen(id)}
        className='h-auto min-h-12 min-w-0 flex-1 items-start justify-start gap-3 px-0! py-2 text-left'
      >
        <span className='min-w-0 flex-1'>
          <span
            className={join(
              'block font-medium wrap-break-word',
              isChecked && 'text-muted-foreground line-through',
            )}
          >
            {name}
          </span>
          <span className='text-muted-foreground block text-xs font-normal'>
            {formatSize(amount, unit)}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

export default memo(ShoppingRow);
