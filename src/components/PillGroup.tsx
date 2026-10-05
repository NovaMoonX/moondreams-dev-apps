import type { ReactNode } from 'react';

import Pill from '@/components/Pill';

export interface PillOption<T extends string> {
  value: T;
  label: string;
  emoji?: string;
}

/** A row of wrapping pills — the container every pick-one or pick-several option row shares. */
export function PillRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role='group' aria-label={label} className='flex flex-wrap gap-2'>
      {children}
    </div>
  );
}

interface PillGroupProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/** Pick exactly one of a few options. */
export function PillGroup<T extends string>({ label, options, value, onChange }: PillGroupProps<T>) {
  return (
    <PillRow label={label}>
      {options.map((option) => (
        <Pill
          key={option.value}
          emoji={option.emoji}
          isSelected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Pill>
      ))}
    </PillRow>
  );
}

interface MultiPillGroupProps<T extends string> {
  label: string;
  options: readonly PillOption<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
}

/** Pick any number of a few options. */
export function MultiPillGroup<T extends string>({ label, options, values, onChange }: MultiPillGroupProps<T>) {
  return (
    <PillRow label={label}>
      {options.map((option) => (
        <Pill
          key={option.value}
          emoji={option.emoji}
          isSelected={values.includes(option.value)}
          onClick={() =>
            onChange(
              values.includes(option.value)
                ? values.filter((value) => value !== option.value)
                : [...values, option.value],
            )
          }
        >
          {option.label}
        </Pill>
      ))}
    </PillRow>
  );
}
