import { Select } from '@moondreamsdev/dreamer-ui/components';

import { UNIT_LABELS, UNITS } from '@apps/pinch/constants';
import type { Unit } from '@apps/pinch/types';

interface UnitSelectProps {
  value: Unit;
  onChange: (unit: Unit) => void;
  className?: string;
  /** Sizes the button itself, for a row where it must match a compact input beside it. */
  triggerClassName?: string;
}

const UNIT_OPTIONS = UNITS.map((unit) => ({
  text: UNIT_LABELS[unit],
  value: unit,
}));

function UnitSelect({
  value,
  onChange,
  className,
  triggerClassName,
}: UnitSelectProps) {
  return (
    <Select
      options={UNIT_OPTIONS}
      value={value}
      className={className}
      triggerClassName={triggerClassName}
      onChange={(next) => onChange(next as Unit)}
    />
  );
}

export default UnitSelect;
