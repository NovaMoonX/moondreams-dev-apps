import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

export interface Method {
  id: string;
  emoji: string;
  title: string;
  description: string;
  onPick: () => void;
  /** The way out for people who want none of the others: last in the list and quieter. */
  isQuiet?: boolean;
}

interface MethodPickerProps {
  methods: Method[];
  disabled?: boolean;
}

/** "How do you want to start?": one row per way in; picking one takes the person to its own screen. */
function MethodPicker({ methods, disabled = false }: MethodPickerProps) {
  return (
    <ul className='space-y-2'>
      {methods.map((method) => (
        <li
          key={method.id}
          className={join(
            'rounded-2xl border',
            method.isQuiet
              ? 'border-border border-dashed'
              : 'border-border bg-card',
          )}
        >
          <Button
            type='button'
            variant='tertiary'
            disabled={disabled}
            onClick={method.onPick}
            className='h-auto min-h-16 w-full justify-start gap-3 px-3! py-3 text-left'
          >
            <span
              className='bg-accent grid size-10 shrink-0 place-items-center rounded-xl text-xl'
              aria-hidden='true'
            >
              {method.emoji}
            </span>
            <span className='min-w-0 flex-1'>
              <span className='text-foreground block font-semibold'>
                {method.title}
              </span>
              <span className='text-muted-foreground block text-sm font-normal'>
                {method.description}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground h-5 w-5 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default MethodPicker;
