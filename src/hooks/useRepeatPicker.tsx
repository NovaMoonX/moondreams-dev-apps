import { useState, type ReactNode } from 'react';

import {
  CustomView,
  PresetsView,
  type PickerShared,
} from '@/components/RepeatPickerViews';
import {
  describeRepeat,
  repeatPresets,
  sameRepeatRule,
  type RepeatRule,
  type Weekday,
} from '@/utils/repeatRule';

type PickerView = 'form' | 'presets' | 'custom';

interface UseRepeatPickerOptions {
  /** Day key of the first run; presets, summaries and the Custom screen are worded from it. */
  startsOn: string;
  /** "HH:mm" put in the words line, or null. */
  time: string | null;
  value: RepeatRule | null;
  onChange: (rule: RepeatRule | null) => void;
  /** Where the presets view's Back goes ("Change Sunday grocery list"). */
  backLabel: string;
  weekStart?: Weekday;
  timeFormat?: (time: string) => string;
  /** The field's label, "How often" by default. */
  label?: string;
}

/**
 * The state of a `RepeatPicker` that swaps its host `FormSheet`'s body: pass `viewKey` to the sheet, render
 * `view ?? <the form>` as its body and `<RepeatPicker picker={picker} />` where the field belongs.
 */
export function useRepeatPicker({
  startsOn,
  time,
  value,
  onChange,
  backLabel,
  weekStart,
  timeFormat,
  label = 'How often',
}: UseRepeatPickerOptions) {
  const [current, setCurrent] = useState<PickerView>('form');
  const resolvedWeekStart: Weekday = weekStart ?? 'SU';
  const shared: PickerShared = {
    startsOn,
    time,
    value,
    onChange,
    weekStart: resolvedWeekStart,
    timeFormat,
  };
  const view: ReactNode =
    current === 'presets' ? (
      <PresetsView
        {...shared}
        backLabel={backLabel}
        onBack={() => setCurrent('form')}
        onCustom={() => setCurrent('custom')}
      />
    ) : current === 'custom' ? (
      <CustomView
        {...shared}
        onBack={() => setCurrent('presets')}
        onDone={() => setCurrent('form')}
      />
    ) : null;
  const matched = repeatPresets(startsOn, resolvedWeekStart).find((preset) =>
    sameRepeatRule(preset.rule, value),
  );
  return {
    viewKey: current,
    view,
    open: () => setCurrent('presets'),
    label,
    fieldText: matched?.label ?? describeRepeat(value, startsOn),
    ...shared,
  };
}
