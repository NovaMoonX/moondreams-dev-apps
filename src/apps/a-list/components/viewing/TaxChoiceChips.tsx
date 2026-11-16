import Pill from '@/components/Pill';
import type { TaxOptions } from '@apps/a-list/utils/ticketDraft';
import { formatTaxRate } from '@apps/a-list/utils/tax';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';

interface TaxChoiceChipsProps {
  /** The tax as shown in the field. */
  value: string;
  options: TaxOptions | null;
  onPick: (cents: number) => void;
}

/** AMC's tax and the usual rate side by side, each named, when they disagree. */
function TaxChoiceChips({ value, options, onPick }: TaxChoiceChipsProps) {
  if (!options) {
    return null;
  }

  const current = parseMoneyToCents(value);
  const choices = [
    {
      key: 'usual',
      cents: options.usualCents,
      label: `Your usual ${formatTaxRate(options.usualRate)}`,
    },
    { key: 'amc', cents: options.amcCents, label: 'AMC lists' },
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
        These two don't agree. Pick the one on your checkout, and we'll lean
        that way at this theater next time.
      </p>
    </div>
  );
}

export default TaxChoiceChips;
