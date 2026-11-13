import SummaryEditor from '@/components/SummaryEditor';
import DateInput from '@/components/DateInput';
import RevealChip from '@/components/RevealChip';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { HORIZON_WORDS } from '@apps/runway/constants';

interface PaysStartRowProps {
  /** The day pays start saving; null starts today. */
  value: number | null;
  onChange: (startsOn: number | null) => void;
  today: number;
  /** The last day that can be picked. */
  lastDate: number;
}

/** "Starting · Today": the one folded row under "My pays before each cost is due", whose editor picks a later day for the pays to start saving. */
function PaysStartRow({ value, onChange, today, lastDate }: PaysStartRowProps) {
  return (
    <SummaryEditor
      label={HORIZON_WORDS.startingLabel}
      summary={
        value === null
          ? HORIZON_WORDS.startingToday
          : formatDateOrdinalUTC(value)
      }
      placeholder={HORIZON_WORDS.startingPick}
      title={HORIZON_WORDS.startingTitle}
      isFramed
      shouldFocus={false}
    >
      <DateInput
        variant='outline'
        aria-label={HORIZON_WORDS.startingLabel}
        min={toDateInputValue(today)}
        max={toDateInputValue(lastDate)}
        value={toDateInputValue(value ?? undefined)}
        onChange={(event) => {
          const picked = fromDateInputValue(event.target.value);
          onChange(
            picked === undefined || picked <= today
              ? null
              : Math.min(picked, lastDate),
          );
        }}
      />
      {value !== null && (
        <div>
          <RevealChip onClick={() => onChange(null)}>
            {HORIZON_WORDS.startingFromToday}
          </RevealChip>
        </div>
      )}
    </SummaryEditor>
  );
}

export default PaysStartRow;
