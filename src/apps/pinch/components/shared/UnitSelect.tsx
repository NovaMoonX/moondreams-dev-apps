import { Select } from '@moondreamsdev/dreamer-ui/components';

import { UNIT_LABELS, UNITS } from '@apps/pinch/constants';
import type { Unit } from '@apps/pinch/types';

interface UnitSelectProps {
  value: Unit;
  onChange: (unit: Unit) => void;
  className?: string;
}

const UNIT_OPTIONS = UNITS.map((unit) => ({
  text: UNIT_LABELS[unit],
  value: unit,
}));

function UnitSelect({ value, onChange, className }: UnitSelectProps) {
  return (
    <Select
      options={UNIT_OPTIONS}
      value={value}
      className={className}
      onChange={(next) => onChange(next as Unit)}
    />
  );
}

export default UnitSelect;
