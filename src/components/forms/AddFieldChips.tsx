import type { ReactNode } from 'react';

import { Button, Label } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

export interface AddFieldChip {
  key: string;
  label: string;
  icon: ReactNode;
}

interface AddFieldChipsProps {
  chips: AddFieldChip[];
  onAdd: (key: string) => void;
  heading?: string;
}

/** A grid of rounded chips for optional fields that aren't on the form yet; tapping one
 * reveals its field in place and the chip goes away. */
function AddFieldChips({ chips, onAdd, heading = 'Add more details' }: AddFieldChipsProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs font-medium'>{heading}</p>
      <div className='grid grid-cols-2 gap-2'>
        {chips.map((chip) => (
          <Button
            key={chip.key}
            type='button'
            variant='tertiary'
            size='sm'
            className='border-border h-9 justify-start gap-2 rounded-full border px-3 text-sm font-medium'
            onClick={() => onAdd(chip.key)}
          >
            <span className='text-muted-foreground'>{chip.icon}</span>
            {chip.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface RemovableFieldProps {
  label: string;
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
}

/** A revealed optional field: its label with a remove button that sends it back to the chips. */
export function RemovableField({ label, removeLabel, onRemove, children }: RemovableFieldProps) {
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between'>
        <Label>{label}</Label>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={removeLabel}
          className='h-7 w-7'
          onClick={onRemove}
        >
          <X className='h-4 w-4' />
        </Button>
      </div>
      {children}
    </div>
  );
}

export default AddFieldChips;
