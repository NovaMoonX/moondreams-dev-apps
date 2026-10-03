import { Button } from '@moondreamsdev/dreamer-ui/components';

import MoneyInput from '@apps/a-list/components/shared/MoneyInput';
import type { FeeValue } from '@apps/a-list/utils/ticketDraft';
import { formatCents } from '@apps/a-list/utils/money';

interface FeeChipsProps {
  value: FeeValue;
  chips: number[];
  error?: string;
  onChange: (value: FeeValue) => void;
}

function FeeChips({ value, chips, error, onChange }: FeeChipsProps) {
  const options = Array.from(
    new Set(
      typeof value.selected === 'number' ? [...chips, value.selected] : chips,
    ),
  );

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-2'>
        {options.map((cents) => (
          <Button
            key={cents}
            type='button'
            size='sm'
            variant={value.selected === cents ? 'primary' : 'secondary'}
            aria-pressed={value.selected === cents}
            onClick={() => onChange({ selected: cents, other: '' })}
          >
            {formatCents(cents)}
          </Button>
        ))}
        <Button
          type='button'
          size='sm'
          variant={value.selected === 'OTHER' ? 'primary' : 'secondary'}
          aria-pressed={value.selected === 'OTHER'}
          onClick={() => onChange({ selected: 'OTHER', other: value.other })}
        >
          Other
        </Button>
      </div>
      {value.selected === 'OTHER' && (
        <MoneyInput
          ariaLabel='Convenience fee'
          placeholder='1.50'
          value={value.other}
          errorMessage={error}
          onChange={(other) => onChange({ selected: 'OTHER', other })}
        />
      )}
    </div>
  );
}

export default FeeChips;
