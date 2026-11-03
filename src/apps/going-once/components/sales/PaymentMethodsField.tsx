import { useState, type KeyboardEvent } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { MultiPillGroup } from '@/components/PillGroup';
import {
  MAX_PAYMENT_METHOD_LENGTH,
  MAX_PAYMENT_METHODS,
  PAYMENT_METHOD_SUGGESTIONS,
} from '@apps/going-once/constants';
import { normalizePaymentMethods } from '@apps/going-once/utils/paymentMethods';

interface PaymentMethodsFieldProps {
  values: string[];
  onChange: (values: string[]) => void;
}

/** The ways buyers can pay: the usual ones in a tap, and the seller's own typed in; a custom one leaves the row when tapped off. */
function PaymentMethodsField({ values, onChange }: PaymentMethodsFieldProps) {
  const [typed, setTyped] = useState('');
  const isFull = values.length >= MAX_PAYMENT_METHODS;
  const custom = values.filter(
    (value) =>
      !PAYMENT_METHOD_SUGGESTIONS.some(
        (suggestion) => suggestion.toLowerCase() === value.toLowerCase(),
      ),
  );
  const options = [...PAYMENT_METHOD_SUGGESTIONS, ...custom].map((method) => ({
    value: method,
    label: method,
  }));
  const canAdd = typed.trim() !== '' && !isFull;

  const add = () => {
    if (!canAdd) return;
    onChange(normalizePaymentMethods([...values, typed]));
    setTyped('');
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };

  return (
    <div className='space-y-3'>
      <MultiPillGroup
        label='Payment methods'
        options={options}
        values={values}
        showAll
        onChange={(next) =>
          onChange(
            next.length > values.length && isFull
              ? values
              : normalizePaymentMethods(next),
          )
        }
      />
      <div className='flex items-center gap-2'>
        <Input
          variant='outline'
          aria-label='Add your own way to pay'
          placeholder='Add your own'
          maxLength={MAX_PAYMENT_METHOD_LENGTH}
          disabled={isFull}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type='button'
          variant='secondary'
          rounded='full'
          disabled={!canAdd}
          onClick={add}
        >
          Add
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>
        {isFull
          ? `That's the most: ${MAX_PAYMENT_METHODS}. Tap one to take it off.`
          : 'Buyers see this.'}
      </p>
    </div>
  );
}

export default PaymentMethodsField;
