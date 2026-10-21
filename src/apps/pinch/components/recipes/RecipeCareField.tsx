import { Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import {
  CARE_DAYS_PER_MONTH,
  MAX_CARE_DAYS,
  MAX_CARE_REHEAT_LENGTH,
  MAX_CARE_TIP_LENGTH,
} from '@apps/pinch/constants';
import {
  getCareProblem,
  getCareSummary,
  type CareText,
} from '@apps/pinch/utils/recipeCare';

interface DaysInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function DaysInput({ label, value, onChange }: DaysInputProps) {
  return (
    <Field label={label} isCompact>
      {() => (
        <div className='relative'>
          <Input
            type='number'
            inputMode='numeric'
            min={1}
            step={1}
            max={MAX_CARE_DAYS}
            variant='outline'
            aria-label={`${label} in days`}
            className={join(
              COMPACT_INPUT_CLASS,
              '[appearance:textfield] pr-14! [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            )}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span
            className='text-muted-foreground pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm'
            aria-hidden='true'
          >
            days
          </span>
        </div>
      )}
    </Field>
  );
}

interface RecipeCareFieldProps {
  value: CareText;
  onChange: (value: CareText) => void;
  position: SummaryGroupPosition;
}

function RecipeCareField({ value, onChange, position }: RecipeCareFieldProps) {
  const problem = getCareProblem(value);
  const set = (patch: Partial<CareText>) => onChange({ ...value, ...patch });

  return (
    <SummaryEditor
      label='Keeping it'
      groupPosition={position}
      icon='🧊'
      title='Keeping it'
      summary={getCareSummary(value)}
      placeholder='Add how to keep it'
      problem={problem}
      lines={2}
    >
      <div className='grid grid-cols-2 gap-3'>
        <DaysInput
          label='Fridge'
          value={value.fridge}
          onChange={(fridge) => set({ fridge })}
        />
        <DaysInput
          label='Freezer'
          value={value.freezer}
          onChange={(freezer) => set({ freezer })}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {`Whole days. A month is ${CARE_DAYS_PER_MONTH}, so ${CARE_DAYS_PER_MONTH * 3} shows as 3 months.`}
      </p>
      <Field label='Reheat' isCompact>
        {() => (
          <Textarea
            rows={2}
            variant='outline'
            aria-label='Reheat'
            className='placeholder:text-sm max-sm:min-h-21'
            placeholder='Oven at 350°F, 15 minutes, covered'
            maxLength={MAX_CARE_REHEAT_LENGTH}
            value={value.reheat}
            onChange={(event) => set({ reheat: event.target.value })}
          />
        )}
      </Field>
      <Field label='Tip' isCompact>
        {() => (
          <Textarea
            rows={2}
            variant='outline'
            aria-label='Tip'
            className='placeholder:text-sm max-sm:min-h-21'
            placeholder='Keep the sauce in its own container'
            maxLength={MAX_CARE_TIP_LENGTH}
            value={value.tip}
            onChange={(event) => set({ tip: event.target.value })}
          />
        )}
      </Field>
      {problem && <p className='text-destructive text-xs'>{problem}</p>}
    </SummaryEditor>
  );
}

export default RecipeCareField;
