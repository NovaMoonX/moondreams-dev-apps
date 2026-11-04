import { Input } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import { PillGroup } from '@/components/PillGroup';
import {
  BILL_EVERY_UNIT_LABELS,
  BILL_EVERY_UNITS,
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABELS,
  FORM_FLOW_WORDS,
  HORIZON_WORDS,
  INCOME_ENDING_LABELS,
  INCOME_ENDINGS,
  MAX_ENDING_COUNT,
  MAX_EVERY_MONTHS,
} from '@apps/runway/constants';
import type { RepeatDraft } from '@apps/runway/utils/repeatDraft';

const frequencyOptions = BILL_FREQUENCIES.map((value) => ({
  value,
  label: BILL_FREQUENCY_LABELS[value],
}));
const everyUnitOptions = BILL_EVERY_UNITS.map((value) => ({
  value,
  label: BILL_EVERY_UNIT_LABELS[value],
}));
const endingOptions = INCOME_ENDINGS.map((value) => ({
  value,
  label: INCOME_ENDING_LABELS[value],
}));

interface RepeatFieldsProps {
  draft: RepeatDraft;
  /** The first payment's day as a date input value, which an end date cannot precede. */
  startDate: string;
  onChange: (patch: Partial<RepeatDraft>) => void;
}

/** How often a cost repeats and when it stops. */
function RepeatFields({ draft, startDate, onChange }: RepeatFieldsProps) {
  return (
    <div className='space-y-3'>
      <p className='text-sm font-medium'>{FORM_FLOW_WORDS.repeatsTitle}</p>
      <PillGroup
        label={FORM_FLOW_WORDS.repeats}
        options={frequencyOptions}
        value={draft.frequency}
        onChange={(frequency) => onChange({ frequency })}
      />
      {draft.frequency === 'custom' && (
        <div className='flex items-center gap-2'>
          <span className='text-sm'>{FORM_FLOW_WORDS.every}</span>
          <div className='w-20 shrink-0'>
            <Input
              type='number'
              inputMode='numeric'
              min={draft.everyUnit === 'years' ? 1 : 2}
              max={
                draft.everyUnit === 'years'
                  ? MAX_EVERY_MONTHS / 12
                  : MAX_EVERY_MONTHS
              }
              variant='outline'
              aria-label={FORM_FLOW_WORDS.everyCount}
              placeholder={draft.everyUnit === 'years' ? '2' : '3'}
              value={draft.everyCount}
              onChange={(event) => onChange({ everyCount: event.target.value })}
            />
          </div>
          <div className='shrink-0'>
            <PillGroup
              label={FORM_FLOW_WORDS.everyUnit}
              options={everyUnitOptions}
              value={draft.everyUnit}
              isThin
              onChange={(everyUnit) => onChange({ everyUnit })}
            />
          </div>
        </div>
      )}
      {draft.frequency !== 'once' && (
        <>
          <p className='text-sm font-medium'>{FORM_FLOW_WORDS.endsTitle}</p>
          <PillGroup
            label={FORM_FLOW_WORDS.ends}
            options={endingOptions}
            value={draft.endKind}
            onChange={(endKind) => onChange({ endKind })}
          />
          {draft.endKind === 'date' && (
            <DateInput
              variant='outline'
              aria-label={HORIZON_WORDS.costLastPayment}
              min={startDate || undefined}
              value={draft.endDate}
              onChange={(event) => onChange({ endDate: event.target.value })}
            />
          )}
          {draft.endKind === 'count' && (
            <Input
              type='number'
              inputMode='numeric'
              min={1}
              max={MAX_ENDING_COUNT}
              variant='outline'
              aria-label={HORIZON_WORDS.costPaymentCount}
              placeholder={HORIZON_WORDS.costPaymentCountHint}
              value={draft.endCount}
              onChange={(event) => onChange({ endCount: event.target.value })}
            />
          )}
        </>
      )}
    </div>
  );
}

export default RepeatFields;
