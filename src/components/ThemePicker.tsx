import type { CSSProperties, KeyboardEvent } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

export interface ThemeSwatch {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  primary: string;
  primaryForeground: string;
  border: string;
}

export interface ThemeOption<T extends string> {
  id: T;
  name: string;
  light: ThemeSwatch;
  dark: ThemeSwatch;
}

interface ThemePickerProps<T extends string> {
  label: string;
  options: readonly ThemeOption<T>[];
  value: T;
  onChange: (id: T) => void;
  lightLabel?: string;
  darkLabel?: string;
}

interface PreviewProps {
  swatch: ThemeSwatch;
  caption: string;
}

const ARROW_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const lineStyle = (color: string, width: string): CSSProperties => ({
  backgroundColor: color,
  width,
});

function Preview({ swatch, caption }: PreviewProps) {
  return (
    <span className='flex min-w-0 flex-1 flex-col gap-1'>
      <span
        className='flex flex-col gap-1.5 rounded-lg border p-1.5'
        style={{
          backgroundColor: swatch.background,
          borderColor: swatch.border,
        }}
        aria-hidden='true'
      >
        <span
          className='flex flex-col gap-1 rounded-md border p-1.5'
          style={{ backgroundColor: swatch.card, borderColor: swatch.border }}
        >
          <span
            className='h-1 rounded-full'
            style={lineStyle(swatch.foreground, '80%')}
          />
          <span
            className='h-1 rounded-full'
            style={lineStyle(swatch.muted, '55%')}
          />
        </span>
        <span
          className='h-3 w-2/3 rounded-full'
          style={{ backgroundColor: swatch.primary }}
        >
          <span
            className='mx-auto mt-[5px] block h-0.5 w-1/2 rounded-full'
            style={{ backgroundColor: swatch.primaryForeground }}
          />
        </span>
      </span>
      <span className='text-muted-foreground text-center text-[11px] leading-3'>
        {caption}
      </span>
    </span>
  );
}

/** Pick one colour theme from cards that each preview it in light and dark; the cards carry their own colours, so it reads the same under any theme. */
function ThemePicker<T extends string>({
  label,
  options,
  value,
  onChange,
  lightLabel = 'Light',
  darkLabel = 'Dark',
}: ThemePickerProps<T>) {
  const selectedIndex = options.findIndex((option) => option.id === value);
  const tabbableIndex = Math.max(selectedIndex, 0);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next =
      options[(tabbableIndex + step + options.length) % options.length];
    onChange(next.id);
    const radios =
      event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    radios[options.indexOf(next)]?.focus();
  };

  return (
    <div
      role='radiogroup'
      aria-label={label}
      className='grid grid-cols-2 gap-2 sm:grid-cols-4'
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isSelected = option.id === value;
        return (
          <Button
            key={option.id}
            type='button'
            variant='tertiary'
            size='stripped'
            role='radio'
            aria-checked={isSelected}
            tabIndex={index === tabbableIndex ? 0 : -1}
            className={join(
              'text-foreground! relative h-auto min-w-0 flex-col items-stretch justify-start gap-2 rounded-xl p-2 text-left font-normal whitespace-normal transition-none',
              isSelected
                ? 'bg-accent! shadow-[inset_0_0_0_2px_var(--color-primary)]'
                : 'shadow-[inset_0_0_0_1px_var(--color-border)]',
            )}
            onClick={() => onChange(option.id)}
          >
            <span className='flex gap-1.5'>
              <Preview swatch={option.light} caption={lightLabel} />
              <Preview swatch={option.dark} caption={darkLabel} />
            </span>
            <span className='flex items-center justify-between gap-1 px-0.5'>
              <span className='min-w-0 text-[13px] leading-4 font-medium text-pretty'>
                {option.name}
              </span>
              {isSelected && (
                <Check
                  className='text-primary size-4 shrink-0'
                  aria-hidden='true'
                />
              )}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export default ThemePicker;
