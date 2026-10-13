import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface Method {
  id: string;
  emoji: string;
  title: string;
  description: string;
  /** Opens in place under the row when the method needs input; without it, picking the row just runs `onPick`. */
  panel?: ReactNode;
  onPick?: () => void;
  /** The way out for people who want none of the others: last in the list and quieter. */
  isQuiet?: boolean;
}

interface MethodPickerProps {
  methods: Method[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  disabled?: boolean;
}

/** "How do you want to start?": one row per way in, the one that needs input opening in place beneath it, one at a time. */
function MethodPicker({
  methods,
  openId,
  onOpenChange,
  disabled = false,
}: MethodPickerProps) {
  return (
    <ul className='space-y-2'>
      {methods.map((method) => {
        const isOpen = openId === method.id;
        const hasPanel = method.panel !== undefined;

        return (
          <li
            key={method.id}
            className={join(
              'rounded-2xl border',
              method.isQuiet
                ? 'border-border border-dashed'
                : 'border-border bg-card',
              isOpen && 'border-[var(--pinch-drizzle)]',
            )}
          >
            <Button
              type='button'
              variant='tertiary'
              disabled={disabled}
              aria-expanded={hasPanel ? isOpen : undefined}
              onClick={() => {
                if (hasPanel) {
                  onOpenChange(isOpen ? null : method.id);
                  return;
                }
                onOpenChange(null);
                method.onPick?.();
              }}
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
              {isOpen ? (
                <ChevronDown
                  className='text-muted-foreground h-5 w-5 shrink-0'
                  aria-hidden='true'
                />
              ) : (
                <ChevronRight
                  className='text-muted-foreground h-5 w-5 shrink-0'
                  aria-hidden='true'
                />
              )}
            </Button>
            {isOpen && hasPanel && (
              <div className='px-3 pb-3'>{method.panel}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default MethodPicker;
