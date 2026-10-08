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

interface SortControlProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  value: T;
  /** The option that means "no sort chosen"; any other value tints the icon. */
  defaultValue: T;
  onChange: (value: T) => void;
}

/** A sort icon button beside a search field: a drawer of large options on phones, a dropdown from `sm` up. */
function SortControl<T extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
}: SortControlProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const { option } = DropdownMenuFactories;
  const isActive = value !== defaultValue;

  const trigger = (
    <Button
      type='button'
      variant={isActive ? 'secondary' : 'outline'}
      rounded='full'
      aria-label={label}
      className='h-12 w-12 shrink-0 p-0'
      onClick={isPhone ? () => setIsOpen(true) : undefined}
    >
      <ArrowUpDown className='h-5 w-5' />
    </Button>
  );

  if (!isPhone) {
    return (
      <DropdownMenu
        items={options.map((choice) =>
          option({
            label: choice.label,
            value: choice.value,
            icon: value === choice.value ? <Check /> : undefined,
          }),
        )}
        onItemSelect={(next) => onChange(next as T)}
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
        isOpen={isOpen}
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
                  setIsOpen(false);
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
      </Drawer>
    </>
  );
}

export default SortControl;
