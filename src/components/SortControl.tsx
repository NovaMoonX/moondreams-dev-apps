import { useState } from 'react';

import {
  Button,
  Drawer,
  DropdownMenu,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUpDown, Check } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { PillOption } from '@/components/PillGroup';

export type SortOrder = 'natural' | 'reversed';

const ORDER_PREFIX = 'order:';

interface SortControlProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  value: T;
  /** The option that means "no sort chosen"; any other value tints the icon. */
  defaultValue: T;
  onChange: (value: T) => void;
  /** Labels for flipping the chosen option's direction ("Newest first" / "Oldest first"); null when it has none. */
  getOrderOptions?: (value: T) => readonly [PillOption<SortOrder>, PillOption<SortOrder>] | null;
  order?: SortOrder;
  onOrderChange?: (order: SortOrder) => void;
}

/** A sort icon button beside a search field: a drawer of large options on phones, a dropdown from `sm` up. */
function SortControl<T extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  getOrderOptions,
  order = 'natural',
  onOrderChange,
}: SortControlProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const { option, separator } = DropdownMenuFactories;
  const isActive = value !== defaultValue;
  const orderOptions = getOrderOptions?.(value) ?? null;

  const trigger = (
    <Button
      type='button'
      variant={isActive ? 'secondary' : 'outline'}
      rounded='full'
      aria-label={`${label}, by ${options.find((choice) => choice.value === value)?.label ?? ''}`}
      className='h-12 w-12 shrink-0 p-0'
      onClick={isPhone ? () => setIsOpen(true) : undefined}
    >
      <ArrowUpDown className='h-5 w-5' />
    </Button>
  );

  if (!isPhone) {
    return (
      <DropdownMenu
        items={[
          ...options.map((choice) =>
            option({
              label: choice.label,
              value: choice.value,
              icon:
                value === choice.value ? (
                  <Check className='text-primary h-4 w-4' />
                ) : (
                  <span className='h-4 w-4' />
                ),
            }),
          ),
          ...(orderOptions
            ? [
                separator(),
                ...orderOptions.map((choice) =>
                  option({
                    label: choice.label,
                    value: `${ORDER_PREFIX}${choice.value}`,
                    icon:
                      order === choice.value ? (
                        <Check className='text-primary h-4 w-4' />
                      ) : (
                        <span className='h-4 w-4' />
                      ),
                  }),
                ),
              ]
            : []),
        ]}
        onItemSelect={(next) =>
          next.startsWith(ORDER_PREFIX)
            ? onOrderChange?.(next.slice(ORDER_PREFIX.length) as SortOrder)
            : onChange(next as T)
        }
        placement='bottom'
        alignment='end'
        trigger={trigger}
      />
    );
  }

  return (
    <>
      {trigger}
      <Drawer
        isOpen={isOpen && isPhone}
        onClose={() => setIsOpen(false)}
        title='Sort by'
        showCloseButton
      >
        <ul className='space-y-2 pb-4'>
          {options.map((choice) => (
            <li key={choice.value}>
              <Button
                type='button'
                variant='tertiary'
                size='stripped'
                aria-pressed={value === choice.value}
                className={join(
                  'text-foreground! h-14 w-full justify-start gap-3 rounded-2xl border px-4 text-left text-base font-normal',
                  value === choice.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border',
                )}
                onClick={() => {
                  onChange(choice.value);
                  if (!getOrderOptions?.(choice.value)) setIsOpen(false);
                }}
              >
                <span className='w-6 shrink-0 text-center' aria-hidden='true'>
                  {choice.emoji}
                </span>
                <span className='flex-1'>{choice.label}</span>
                {value === choice.value && <Check className='h-5 w-5' />}
              </Button>
            </li>
          ))}
        </ul>
        {orderOptions && (
          <div className='space-y-2 pb-4'>
            <p className='text-muted-foreground text-sm'>Order</p>
            <div className='grid grid-cols-2 gap-2'>
              {orderOptions.map((choice) => (
                <Button
                  key={choice.value}
                  type='button'
                  variant='tertiary'
                  size='stripped'
                  aria-pressed={order === choice.value}
                  className={join(
                    'text-foreground! h-12 rounded-2xl border px-3 text-base font-normal',
                    order === choice.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border',
                  )}
                  onClick={() => onOrderChange?.(choice.value)}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

export default SortControl;
