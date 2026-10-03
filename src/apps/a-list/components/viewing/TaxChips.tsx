import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { formatTaxRate } from '@apps/a-list/utils/tax';
import type { RateValue } from '@apps/a-list/utils/ticketDraft';

interface TaxChipsProps {
  value: RateValue;
  chips: number[];
  error?: string;
  onChange: (value: RateValue) => void;
}

/** Tapping the selected rate (or Other) again clears it: no tax. */
function TaxChips({ value, chips, error, onChange }: TaxChipsProps) {
  const options = Array.from(
    new Set(
      typeof value.selected === 'number' ? [...chips, value.selected] : chips,
    ),
  );

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-2'>
        {options.map((rate) => (
          <Button
            key={rate}
            type='button'
            size='sm'
            variant={value.selected === rate ? 'primary' : 'secondary'}
            aria-pressed={value.selected === rate}
            onClick={() =>
              onChange({
                selected: value.selected === rate ? 'NONE' : rate,
                other: '',
              })
            }
          >
            {formatTaxRate(rate)}
          </Button>
        ))}
        <Button
          type='button'
          size='sm'
          variant={value.selected === 'OTHER' ? 'primary' : 'secondary'}
          aria-pressed={value.selected === 'OTHER'}
          onClick={() =>
            onChange(
              value.selected === 'OTHER'
                ? { selected: 'NONE', other: '' }
                : { selected: 'OTHER', other: value.other },
            )
          }
        >
          Other
        </Button>
      </div>
      {value.selected === 'OTHER' && (
        <div className='relative max-w-40'>
          <Input
            type='text'
            inputMode='decimal'
            variant='outline'
            aria-label='Tax rate percent'
            placeholder='8.875'
            className='pr-6'
            value={value.other}
            errorMessage={error}
            onChange={(event) =>
              onChange({ selected: 'OTHER', other: event.target.value })
            }
          />
          <span className='text-muted-foreground pointer-events-none absolute top-2 right-3 text-sm'>
            %
          </span>
        </div>
      )}
    </div>
  );
}

export default TaxChips;
