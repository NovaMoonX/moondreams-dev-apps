import { Label, Select } from '@moondreamsdev/dreamer-ui/components';

import Pill from '@apps/a-list/components/shared/Pill';
import {
  AMC_FORMAT_LABELS,
  AMC_FORMATS,
  WATCH_PRIORITIES,
  WATCH_PRIORITY_EMOJIS,
  WATCH_PRIORITY_LABELS,
} from '@apps/a-list/constants';
import type { AmcFormat, WatchPriority } from '@apps/a-list/types';

export interface WatchlistDetailsValues {
  priority: WatchPriority;
  preferredFormat: AmcFormat | 'NONE';
}

const FORMAT_OPTIONS = [
  { value: 'NONE', text: 'No preference' },
  ...AMC_FORMATS.map((format) => ({
    value: format,
    text: AMC_FORMAT_LABELS[format],
  })),
];

interface WatchlistDetailsFieldsProps {
  values: WatchlistDetailsValues;
  onChange: (values: WatchlistDetailsValues) => void;
}

function WatchlistDetailsFields({
  values,
  onChange,
}: WatchlistDetailsFieldsProps) {
  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label>How badly do you want to see it?</Label>
        <div className='flex flex-wrap gap-2'>
          {WATCH_PRIORITIES.map((priority) => (
            <Pill
              key={priority}
              emoji={WATCH_PRIORITY_EMOJIS[priority]}
              isSelected={values.priority === priority}
              onClick={() => onChange({ ...values, priority })}
            >
              {WATCH_PRIORITY_LABELS[priority]}
            </Pill>
          ))}
        </div>
      </div>
      <div className='space-y-2'>
        <Label>Preferred format</Label>
        <Select
          options={FORMAT_OPTIONS}
          value={values.preferredFormat}
          onChange={(preferredFormat) =>
            onChange({
              ...values,
              preferredFormat: preferredFormat as AmcFormat | 'NONE',
            })
          }
        />
      </div>
    </div>
  );
}

export default WatchlistDetailsFields;
