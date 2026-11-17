import Pill from '@/components/Pill';
import type { TaxOptions } from '@apps/a-list/utils/ticketDraft';
import { formatTaxRate } from '@apps/a-list/utils/tax';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';

interface TaxChoiceChipsProps {
  value: string;
  options: TaxOptions | null;
  onPick: (cents: number) => void;
}

function TaxChoiceChips({ value, options, onPick }: TaxChoiceChipsProps) {
  if (!options) {
    return null;
  }

  const current = parseMoneyToCents(value);
  const choices = [
    {
      key: 'usual',
      cents: options.usualCents,
      label: `Usual ${formatTaxRate(options.usualRate)}`,
    },
    { key: 'amc', cents: options.amcCents, label: 'AMC' },
  ];

  return (
    <div className='space-y-1.5'>
      <div className='flex flex-wrap gap-2'>
        {choices.map((choice) => (
          <Pill
            key={choice.key}
            isSelected={current === choice.cents}
            onClick={() => onPick(choice.cents)}
          >
            {choice.label} · {formatCents(choice.cents)}
          </Pill>
        ))}
      </div>
      <p className='text-muted-foreground text-xs'>
        Tap the one on your checkout; we'll remember it here.
      </p>
    </div>
  );
}

export default TaxChoiceChips;
