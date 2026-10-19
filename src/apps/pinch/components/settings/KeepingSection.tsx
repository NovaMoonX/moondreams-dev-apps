import { useState, type ReactNode } from 'react';

import { PillGroup } from '@/components/PillGroup';
import SettingsGroup from '@/components/SettingsGroup';
import Stepper from '@/components/Stepper';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import {
  CONTAINER_FRIDGE_DAYS,
  CONTAINER_PLACE_EMOJIS,
  FREEZER_DAYS_RANGE,
  FREEZER_DAY_CHOICES,
  FRIDGE_DAYS_RANGE,
  FRIDGE_DAY_CHOICES,
} from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import { formatCareDays } from '@apps/pinch/utils/recipeCare';
import { isAboveFridgeGuidance } from '@apps/pinch/utils/settings';

const OTHER = 'other';
const DAYS_PER_WEEK = 7;

interface DaysRowProps {
  place: 'FRIDGE' | 'FREEZER';
  title: string;
  description: string;
  days: number;
  position: SummaryGroupPosition;
  choices: { days: number; label: string }[];
  /** The stepper for a number the pills don't have: whole days in the fridge, whole weeks in the freezer. */
  stepper: {
    label: string;
    unit: string;
    toValue: (days: number) => number;
    toDays: (value: number) => number;
    min: number;
    max: number;
  };
  onChange: (days: number) => void;
}

type DaysEditorProps = Omit<DaysRowProps, 'place' | 'position'>;

/** One place's days: the common choices as pills, and "Other" opens a stepper for any number between the limits. */
function DaysEditor({
  title,
  description,
  days,
  choices,
  stepper,
  onChange,
}: DaysEditorProps) {
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const isCustom = !choices.some((choice) => choice.days === days);
  const isStepperShown = isCustom || isOtherOpen;
  const options: { value: string; label: string }[] = [
    ...choices.map((choice) => ({
      value: String(choice.days),
      label: choice.label,
    })),
    { value: OTHER, label: 'Other' },
  ];

  const handlePick = (value: string) => {
    if (value === OTHER) {
      setIsOtherOpen(true);
      return;
    }
    setIsOtherOpen(false);
    onChange(Number(value));
  };

  return (
    <>
      <p className='text-muted-foreground text-sm text-pretty'>{description}</p>
      <PillGroup
        label={`${title}: how many days a new box starts with`}
        options={options}
        value={isStepperShown ? OTHER : String(days)}
        onChange={handlePick}
      />
      {isStepperShown && (
        <div className='flex items-center gap-3'>
          <Stepper
            label={stepper.label}
            value={stepper.toValue(days)}
            min={stepper.min}
            max={stepper.max}
            step={1}
            onChange={(value) => onChange(stepper.toDays(value))}
          />
          <span className='text-muted-foreground text-sm'>{stepper.unit}</span>
        </div>
      )}
    </>
  );
}

/** A row of the group's frame that says what is set and opens its pills; the cell reaches the frame's edges so the chip lines up with the rows of the other groups. */
function DaysRow({ place, position, ...editor }: DaysRowProps) {
  return (
    <li className='-mx-3'>
      <SummaryEditor
        label={editor.title}
        title={editor.title}
        groupPosition={position}
        icon={CONTAINER_PLACE_EMOJIS[place]}
        summary={formatKeepDays(editor.days)}
        placeholder=''
        shouldFocus={false}
      >
        <DaysEditor {...editor} />
      </SummaryEditor>
    </li>
  );
}

const YEAR_DAYS = 365;
const formatKeepDays = (days: number) =>
  days === YEAR_DAYS ? '1 year' : formatCareDays(days);

const FRIDGE_CHOICES = FRIDGE_DAY_CHOICES.map((days) => ({
  days,
  label: formatKeepDays(days),
}));
const FREEZER_CHOICES = FREEZER_DAY_CHOICES.map((days) => ({
  days,
  label: formatKeepDays(days),
}));

interface KeepingSectionProps {
  uid: string;
}

/** The days a new fridge or freezer box starts with. A recipe's own days still win, and boxes already put away keep their dates. */
function KeepingSection({ uid }: KeepingSectionProps) {
  const { usualDays, save } = usePinchSettings(uid);

  const footer: ReactNode = (
    <>
      <p>Boxes you’ve already put away keep their dates.</p>
      {isAboveFridgeGuidance(usualDays.fridge) && (
        <p>
          Most food-safety guidance says three to four days for cooked leftovers
          in the fridge.
        </p>
      )}
    </>
  );

  return (
    <SettingsGroup
      title='How long things keep'
      description={`We start cooked food at ${CONTAINER_FRIDGE_DAYS} days in the fridge. Change it if you’re comfortable with more, or less.`}
      footer={footer}
    >
      <DaysRow
        place='FRIDGE'
        title='Fridge'
        description='A new box starts with this many days.'
        position='first'
        days={usualDays.fridge}
        choices={FRIDGE_CHOICES}
        stepper={{
          label: 'Fridge days',
          unit: usualDays.fridge === 1 ? 'day' : 'days',
          toValue: (days) => days,
          toDays: (value) => value,
          min: FRIDGE_DAYS_RANGE.min,
          max: FRIDGE_DAYS_RANGE.max,
        }}
        onChange={(fridgeDays) => void save({ fridgeDays })}
      />
      <DaysRow
        place='FREEZER'
        title='Freezer'
        description='A new box starts with this long.'
        position='last'
        days={usualDays.freezer}
        choices={FREEZER_CHOICES}
        stepper={{
          label: 'Freezer weeks',
          unit: 'weeks',
          toValue: (days) => Math.round(days / DAYS_PER_WEEK),
          toDays: (weeks) => weeks * DAYS_PER_WEEK,
          min: Math.ceil(FREEZER_DAYS_RANGE.min / DAYS_PER_WEEK),
          max: Math.floor(FREEZER_DAYS_RANGE.max / DAYS_PER_WEEK),
        }}
        onChange={(freezerDays) => void save({ freezerDays })}
      />
    </SettingsGroup>
  );
}

export default KeepingSection;
