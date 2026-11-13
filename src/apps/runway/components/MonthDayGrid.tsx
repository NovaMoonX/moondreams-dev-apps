import Pill from '@/components/Pill';
import { LAST_DAY, toOrdinal } from '@apps/runway/utils/monthDays';

const MONTH_DAYS = Array.from({ length: LAST_DAY }, (_, index) => index + 1);

interface MonthDayGridProps {
  label: string;
  value: number | null;
  onPick: (day: number) => void;
}

/** The days of a month as a seven-wide grid of pills; 31 stands for a short month's last day. */
function MonthDayGrid({ label, value, onPick }: MonthDayGridProps) {
  return (
    <div className='grid grid-cols-7 gap-1.5' role='group' aria-label={label}>
      {MONTH_DAYS.map((day) => (
        <Pill
          key={day}
          className="relative w-full px-0! after:absolute after:-inset-x-[3px] after:inset-y-0 after:content-['']"
          isSelected={value === day}
          ariaLabel={toOrdinal(day)}
          onClick={() => onPick(day)}
        >
          {String(day)}
        </Pill>
      ))}
    </div>
  );
}

export default MonthDayGrid;
