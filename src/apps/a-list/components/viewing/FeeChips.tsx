import Pill from '@apps/a-list/components/shared/Pill';
import { formatCents, parseMoneyToCents } from '@apps/a-list/utils/money';

interface FeeChipsProps {
  /** The fee as typed. */
  value: string;
  /** Fees entered on past tickets, $0 first. */
  chips: number[];
  onPick: (cents: number) => void;
}

/** One-tap fees from past tickets, so repeating one is a tap rather than typing. */
function FeeChips({ value, chips, onPick }: FeeChipsProps) {
  const current = parseMoneyToCents(value);

  return (
    <div className='flex flex-wrap gap-2'>
      {chips.map((cents) => (
        <Pill
          key={cents}
          isSelected={current === cents}
          onClick={() => onPick(cents)}
        >
          {formatCents(cents)}
        </Pill>
      ))}
    </div>
  );
}

export default FeeChips;
