import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import MoneyInput from '@/components/MoneyInput';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import { HELM_COPY } from '@apps/helm/constants';

/** `MoneyInput` for an amount (answered in cents), else a number field with its unit after it; a value outside the range says so. */
function NumberAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { min, max, unit, isMoney, decimals } = question.number ?? {
    min: null,
    max: null,
    unit: null,
    isMoney: false,
    decimals: 0 as const,
  };
  const send = () => {
    const scale = 10 ** decimals;
    const value = isMoney
      ? parseMoneyToCents(text)
      : Math.round(Number(text) * scale) / scale;
    if (value === null || text.trim() === '' || !Number.isFinite(value)) return;
    if ((min !== null && value < min) || (max !== null && value > max)) {
      setError(HELM_COPY.questionNumberOutOfRange(min, max));
      return;
    }
    onAnswer({ shape: 'number', value });
  };
  const change = (next: string) => {
    setError(null);
    setText(next);
  };

  return (
    <div className='flex w-full flex-col items-stretch gap-2'>
      <div className='flex items-center gap-2'>
        {isMoney ? (
          <MoneyInput
            variant='outline'
            ariaLabel={HELM_COPY.questionNumberLabel}
            wrapperClassName='min-w-0 flex-1'
            value={text}
            onChange={change}
            errorMessage={error ?? undefined}
          />
        ) : (
          <Input
            type='number'
            inputMode={decimals === 0 ? 'numeric' : 'decimal'}
            variant='outline'
            aria-label={HELM_COPY.questionNumberLabel}
            className='helm-field'
            value={text}
            errorMessage={error ?? undefined}
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              send();
            }}
          />
        )}
        {unit && !isMoney && (
          <span className='text-muted-foreground shrink-0 text-[15px]'>
            {unit}
          </span>
        )}
      </div>
      <Button
        type='button'
        variant='primary'
        className='self-end'
        disabled={isBusy || text.trim() === ''}
        onClick={send}
      >
        {HELM_COPY.questionSend}
      </Button>
    </div>
  );
}

export default NumberAnswer;
