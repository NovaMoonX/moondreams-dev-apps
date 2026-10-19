import { Input, Label } from '@moondreamsdev/dreamer-ui/components';

import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import { PillGroup } from '@/components/PillGroup';
import PackageDateField from '@apps/pinch/components/pantry/PackageDateField';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import { PACKAGE_PLACE_OPTIONS } from '@apps/pinch/constants';
import type { PackagePlace, Unit } from '@apps/pinch/types';
import type { DateAnswer } from '@apps/pinch/utils/packages';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface PackageFieldValues {
  amountText: string;
  unit: Unit;
  place: PackagePlace;
  date: DateAnswer;
}

interface PackageFieldsProps {
  value: PackageFieldValues;
  onChange: (value: PackageFieldValues) => void;
  /** What the amount is of, for screen readers ("Milk"). */
  name: string;
  /** Leaves the date question out, for a form that asks it somewhere else. */
  isDateHidden?: boolean;
  className?: string;
}

/** How much, where and until when: the three answers a package needs, as one block the add form, the edit form and the shopping step-through share. */
function PackageFields({
  value,
  onChange,
  name,
  isDateHidden = false,
  className,
}: PackageFieldsProps) {
  return (
    <div className={join('space-y-4', className)}>
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs'>How much</Label>
        <div className='flex items-center gap-2'>
          <Input
            type='number'
            inputMode='decimal'
            min={0}
            step='any'
            variant='outline'
            aria-label={`Amount of ${name}`}
            placeholder='1'
            className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
            value={value.amountText}
            onChange={(event) =>
              onChange({ ...value, amountText: event.target.value })
            }
          />
          <UnitSelect
            value={value.unit}
            className='w-24 shrink-0'
            triggerClassName='h-10! py-0!'
            onChange={(unit) => onChange({ ...value, unit })}
          />
        </div>
      </div>
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs'>Where</Label>
        <PillGroup
          label='Where it goes'
          options={PACKAGE_PLACE_OPTIONS}
          value={value.place}
          onChange={(place) => onChange({ ...value, place })}
        />
      </div>
      {!isDateHidden && (
        <PackageDateField
          value={value.date}
          onChange={(date) => onChange({ ...value, date })}
        />
      )}
    </div>
  );
}

export default PackageFields;
