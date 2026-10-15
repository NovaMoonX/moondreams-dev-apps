import { memo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

interface ShoppingRowProps {
  id: string;
  name: string;
  amountText: string | null;
  isChecked: boolean;
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
}

/** Props are plain values so a tick re-renders only its own row. */
function ShoppingRow({
  id,
  name,
  amountText,
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
          {amountText && (
            <span className='text-muted-foreground block text-xs font-normal'>
              {amountText}
            </span>
          )}
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
