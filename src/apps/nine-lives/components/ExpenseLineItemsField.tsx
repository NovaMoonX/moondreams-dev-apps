import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { X } from '@moondreamsdev/dreamer-ui/symbols';

import { createEmptyLineItem, type LineItemValue } from '../utils/expenseLineItems';
import CategoryField from './CategoryField';

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

interface ExpenseLineItemsFieldProps {
  value: LineItemValue[];
  onValueChange: (value: LineItemValue[]) => void;
  disabled?: boolean;
}

/** Free-entry line-item rows (text + amount), each with its own remove (X) button and a running total. */
function ExpenseLineItemsField({ value, onValueChange, disabled }: ExpenseLineItemsFieldProps) {
  const updateItem = (id: string, changes: Partial<LineItemValue>) => {
    onValueChange(value.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };

  const removeItem = (id: string) => {
    onValueChange(value.filter((item) => item.id !== id));
  };

  const total = value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <div className='space-y-2'>
      {value.map((item) => (
        <div key={item.id} className='space-y-2 rounded-md border border-border p-2'>
          <div className='flex items-center gap-2'>
            <div className='flex-1'>
              <Input
                value={item.label}
                onChange={(event) => updateItem(item.id, { label: event.target.value })}
                placeholder='e.g. Exam fee'
                variant='outline'
                disabled={disabled}
              />
            </div>
            <div className='w-28 shrink-0'>
              <Input
                value={item.amount}
                onChange={(event) => updateItem(item.id, { amount: event.target.value })}
                placeholder='72.00'
                type='number'
                variant='outline'
                disabled={disabled}
              />
            </div>
            {value.length > 1 && (
              <button
                type='button'
                onClick={() => removeItem(item.id)}
                disabled={disabled}
                aria-label='Remove line item'
                className='text-muted-foreground hover:text-destructive shrink-0 disabled:pointer-events-none disabled:opacity-50'
              >
                <X className='h-4 w-4' />
              </button>
            )}
          </div>
          <CategoryField
            value={item.category}
            onValueChange={(category) => updateItem(item.id, { category })}
            disabled={disabled}
          />
        </div>
      ))}
      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={mutedLinkClassName}
          onClick={() => onValueChange([...value, createEmptyLineItem()])}
          disabled={disabled}
        >
          + Add line item
        </Button>
        <span className='text-sm font-semibold'>Total: {currencyFormatter.format(total)}</span>
      </div>
    </div>
  );
}

export default ExpenseLineItemsField;
