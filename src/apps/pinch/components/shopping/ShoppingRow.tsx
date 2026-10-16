import { memo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

interface ShoppingRowProps {
  id: string;
  name: string;
  amountText: string | null;
  /** What the line is for ("Thu dinner and Adobo chicken"), wrapping under the amount. */
  forText: string | null;
  isChecked: boolean;
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
}

/** A tap anywhere on the name ticks it; the chevron opens the amount. Props are plain values so a tick re-renders only its own row. */
function ShoppingRow({
  id,
  name,
  amountText,
  forText,
  isChecked,
  onToggle,
  onOpen,
}: ShoppingRowProps) {
  return (
    <li className='flex items-start gap-1'>
      <label className='flex min-h-12 min-w-0 flex-1 cursor-pointer items-start gap-3 py-2 select-none'>
        <span className='mt-0.5 inline-flex shrink-0'>
          <Checkbox
            aria-label={`Got ${name}`}
            checked={isChecked}
            onCheckedChange={(checked) => onToggle(id, checked === true)}
          />
        </span>
        <span className='min-w-0 flex-1'>
          <span
            className={join(
              'block font-medium wrap-break-word',
              isChecked && 'text-muted-foreground line-through',
            )}
          >
            {name}
          </span>
          {(amountText || forText) && (
            <span className='text-muted-foreground block text-xs wrap-break-word'>
              {amountText && (
                <span className='whitespace-nowrap'>{amountText}</span>
              )}
              {forText &&
                (amountText ? `\u00a0·\u00a0for ${forText}` : `For ${forText}`)}
            </span>
          )}
        </span>
      </label>
      <Button
        type='button'
        variant='tertiary'
        aria-label={`Change ${name}`}
        onClick={() => onOpen(id)}
        className='h-10! w-10! shrink-0 justify-end p-0!'
      >
        <ChevronRight
          className='text-muted-foreground h-5 w-5'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

export default memo(ShoppingRow);
