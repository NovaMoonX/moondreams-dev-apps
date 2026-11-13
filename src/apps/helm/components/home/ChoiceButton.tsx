import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';

// A 28px button reaches 40px tall through its pseudo-element, which the 12px gaps leave clear.
export const QUIET_CLASS =
  "relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']";

interface ChoiceGroupProps {
  /** The question, read out as the group's name. */
  label: string;
  /** `radio` is one answer, `checkbox` is several. */
  kind: 'radio' | 'checkbox';
  children: ReactNode;
}

/** A question's options as one grouped card with hairlines between its rows. */
export function ChoiceGroup({ label, kind, children }: ChoiceGroupProps) {
  return (
    <div
      role={kind === 'radio' ? 'radiogroup' : 'group'}
      aria-label={label}
      className='helm-card divide-border divide-y overflow-hidden'
    >
      {children}
    </div>
  );
}

interface IndicatorProps {
  kind: 'radio' | 'checkbox';
  isSelected: boolean;
}

function Indicator({ kind, isSelected }: IndicatorProps) {
  return (
    <span
      aria-hidden='true'
      className={join(
        'grid size-5 shrink-0 place-items-center border-2',
        kind === 'radio' ? 'rounded-full' : 'rounded-[6px]',
        isSelected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/60',
      )}
    >
      {isSelected &&
        (kind === 'radio' ? (
          <span className='bg-primary-foreground size-2 rounded-full' />
        ) : (
          <Check className='size-3.5' strokeWidth={3} />
        ))}
    </span>
  );
}

interface ChoiceRowProps {
  label: string;
  detail?: string | null;
  kind: 'radio' | 'checkbox';
  isSelected: boolean;
  isDisabled: boolean;
  /** "None of these" and "New" read as options but one step quieter than the real ones. */
  isQuiet?: boolean;
  /** Replaces the radio or tick, for a row that opens a field ("Something else"). */
  icon?: ReactNode;
  onClick: () => void;
}

/** One option: a leading radio or tick, its label, and what tells it apart under it. The whole row is the tap target. */
export function ChoiceRow({
  label,
  detail = null,
  kind,
  isSelected,
  isDisabled,
  isQuiet = false,
  icon,
  onClick,
}: ChoiceRowProps) {
  return (
    <Button
      type='button'
      variant='base'
      role={kind}
      aria-checked={isSelected}
      aria-label={HELM_COPY.questionOptionAria(label, detail)}
      disabled={isDisabled}
      className='h-auto min-h-[52px] w-full justify-start gap-3 rounded-none px-3.5 py-2.5 text-left font-normal transition-none'
      onClick={onClick}
    >
      {icon ?? <Indicator kind={kind} isSelected={isSelected} />}
      <span className='flex min-w-0 flex-1 flex-col items-start'>
        <span
          className={join(
            'text-[15px] leading-[21px] break-words',
            isQuiet && 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {detail && (
          <span className='text-muted-foreground text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
    </Button>
  );
}
