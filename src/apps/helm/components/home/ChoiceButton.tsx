import type { ReactNode } from 'react';

import type { LucideIcon } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';

// A 28px button reaches 40px tall through its pseudo-element, which the 12px gaps leave clear.
export const QUIET_CLASS =
  "relative whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']";

interface ChoiceGroupProps {
  label: string;
  kind: 'radio' | 'checkbox';
  children: ReactNode;
}

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
        'mt-px grid size-5 shrink-0 place-items-center border-2',
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
  isQuiet?: boolean;
  opensWith?: LucideIcon;
  onClick: () => void;
}

export function ChoiceRow({
  label,
  detail = null,
  kind,
  isSelected,
  isDisabled,
  isQuiet = false,
  opensWith: OpenerIcon,
  onClick,
}: ChoiceRowProps) {
  return (
    <Button
      type='button'
      variant='base'
      role={OpenerIcon ? undefined : kind}
      aria-checked={OpenerIcon ? undefined : isSelected}
      aria-expanded={OpenerIcon ? isSelected : undefined}
      aria-label={HELM_COPY.questionOptionAria(label, detail)}
      disabled={isDisabled}
      className='focus-visible:outline-primary h-auto min-h-[52px] w-full items-start justify-start gap-3 rounded-none px-3.5 py-[15px] text-left font-normal transition-none focus-visible:outline-2 focus-visible:-outline-offset-2'
      onClick={onClick}
    >
      {OpenerIcon ? (
        <OpenerIcon
          className={join(
            'mt-px size-5 shrink-0',
            isSelected ? 'text-primary' : 'text-muted-foreground',
          )}
          aria-hidden='true'
        />
      ) : (
        <Indicator kind={kind} isSelected={isSelected} />
      )}
      <span className='flex min-w-0 flex-1 flex-col items-start'>
        <span
          className={join(
            'line-clamp-2 text-[15px] leading-[21px] break-words',
            isQuiet && 'text-muted-foreground',
            OpenerIcon && isSelected && 'text-primary',
          )}
        >
          {label}
        </span>
        {detail && (
          <span className='text-muted-foreground line-clamp-2 text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
    </Button>
  );
}
