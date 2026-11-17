import { useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** A smaller stepper for a row in a list; the 40px target is kept by an invisible hit area. */
  isCompact?: boolean;
}

const toStep = (raw: number, step: number) => Math.round(raw / step) * step;

/** A half-step stepper with 40px targets, for a count like servings or portions; tapping the number types it. */
function Stepper({
  value,
  onChange,
  label,
  min = 0.5,
  max = 1000,
  step = 0.5,
  isCompact = false,
}: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const isCancelled = useRef(false);

  const commit = () => {
    if (draft === null || isCancelled.current) return;
    const parsed = Number(draft.replace(',', '.'));
    setDraft(null);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return;
    const next = Math.min(max, Math.max(min, toStep(parsed, step)));
    if (next !== value) onChange(Number(next.toFixed(4)));
  };

  const sizeClass = isCompact
    ? 'h-8 min-w-8 text-base'
    : 'h-10 min-w-10 text-lg';

  return (
    <div
      role='group'
      aria-label={label}
      className={join('flex items-center', isCompact ? 'gap-1' : 'gap-2')}
    >
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
        className={join(
          isCompact
            ? "relative size-8 after:absolute after:-inset-1 after:content-['']"
            : 'size-10',
        )}
      >
        <Minus className='h-4 w-4' aria-hidden='true' />
      </Button>
      {draft === null ? (
        <Button
          type='button'
          variant='tertiary'
          aria-label={`${label}: ${value}. Tap to type a number`}
          aria-live='polite'
          onClick={() => {
            isCancelled.current = false;
            setDraft(String(value));
          }}
          className={join(
            "relative px-1 text-center font-semibold tabular-nums after:absolute after:-inset-x-1 after:-inset-y-1 after:content-['']",
            sizeClass,
          )}
        >
          {value}
        </Button>
      ) : (
        <Input
          type='text'
          inputMode='decimal'
          aria-label={label}
          autoFocus
          value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              event.stopPropagation();
              isCancelled.current = true;
              setDraft(null);
            }
          }}
          className={join(
            'w-14 px-1 text-center font-semibold tabular-nums',
            isCompact ? 'h-8 text-base' : 'h-10 text-lg',
          )}
        />
      )}
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value + step > max}
        onClick={() => onChange(value + step)}
        className={join(
          isCompact
            ? "relative size-8 after:absolute after:-inset-1 after:content-['']"
            : 'size-10',
        )}
      >
        <Plus className='h-4 w-4' aria-hidden='true' />
      </Button>
    </div>
  );
}

export default Stepper;
