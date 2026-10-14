import { Input, Textarea } from '@moondreamsdev/dreamer-ui/components';

import Field from '@/components/forms/Field';
import SummaryEditor from '@/components/SummaryEditor';
import {
  MAX_CARE_DAYS,
  MAX_CARE_REHEAT_LENGTH,
  MAX_CARE_TIP_LENGTH,
} from '@apps/pinch/constants';
import {
  getCareProblem,
  getCareSummary,
  parseCareText,
  type CareText,
} from '@apps/pinch/utils/recipeCare';

interface DaysInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function DaysInput({ label, value, onChange }: DaysInputProps) {
  return (
    <Field label={label}>
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
            className='[appearance:textfield] pr-14! [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
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
}

function RecipeCareField({ value, onChange }: RecipeCareFieldProps) {
  const problem = getCareProblem(value);
  const set = (patch: Partial<CareText>) => onChange({ ...value, ...patch });

  return (
    <SummaryEditor
      label='Keeping it'
      title='Keeping it'
      summary={getCareSummary(parseCareText(value))}
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
        How many days it keeps. A month is 30 days, so 90 shows as 3 months.
      </p>
      <Field label='Reheat'>
        {() => (
          <Input
            variant='outline'
            placeholder='Oven at 350°F for 15 minutes, covered'
            maxLength={MAX_CARE_REHEAT_LENGTH}
            value={value.reheat}
            onChange={(event) => set({ reheat: event.target.value })}
          />
        )}
      </Field>
      <Field label='Tip'>
        {() => (
          <Textarea
            rows={3}
            variant='outline'
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
