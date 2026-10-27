import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

interface ActionRowProps {
  icon: ReactNode;
  label: string;
  /** A consequence the label can't carry; leave it out when there is none. */
  subtitle?: string;
  onClick: () => void;
  isDisabled?: boolean;
  /** Sits at the row's right edge beside its button, not inside it (a help icon). */
  trailing?: ReactNode;
  /** Inside an `ActionGroup`, which draws the one frame. */
  isGrouped?: boolean;
  /** Red, for the one row that removes something; it goes last, on its own. */
  isDestructive?: boolean;
  /** For a view or sheet whose whole content is its rows: a 40px icon chip, a body-size title and a 14px subtitle. Compact (15px title, 13px subtitle) is for places where space is short. */
  isRoomy?: boolean;
  /** The row opens something (a sheet, a view, a screen) rather than acting at once. */
  hasChevron?: boolean;
}

/** A row for a drawer's block of actions: compact and tinted, or roomy where the rows are a view's whole content. */
function ActionRow({
  icon,
  label,
  subtitle,
  onClick,
  isDisabled = false,
  trailing,
  isGrouped = false,
  isDestructive = false,
  isRoomy = false,
  hasChevron = false,
}: ActionRowProps) {
  const hasTrailing = Boolean(trailing);
  const iconSlot = isRoomy ? (
    <span
      className={join(
        'mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-lg leading-none [&_svg]:size-5',
        isDestructive
          ? 'bg-destructive/10 text-destructive'
          : 'bg-accent text-accent-foreground',
      )}
      aria-hidden='true'
    >
      {icon}
    </span>
  ) : (
    <span className='w-5 shrink-0' aria-hidden='true'>
      {icon}
    </span>
  );

  const button = (
    <Button
      type='button'
      variant='tertiary'
      size={isRoomy ? 'stripped' : undefined}
      rounded={isRoomy ? 'none' : undefined}
      disabled={isDisabled}
      className={join(
        'w-full justify-start gap-3 text-left focus-visible:rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2',
        isRoomy
          ? 'hover:bg-muted min-h-16 items-start px-3 py-3 font-normal whitespace-normal'
          : 'h-auto min-h-11 rounded-none py-1.5',
        isDestructive ? 'text-destructive!' : 'text-foreground!',
        hasTrailing && 'min-w-0 flex-1',
      )}
      onClick={onClick}
    >
      {iconSlot}
      <span
        className={join(
          'min-w-0 text-left',
          hasChevron && 'flex-1',
          isRoomy && 'flex min-h-11 flex-col justify-center',
        )}
      >
        <span
          className={join(
            'block',
            isRoomy ? 'font-medium' : 'text-[15px] leading-5',
          )}
        >
          {label}
        </span>
        {subtitle && (
          <span
            className={join(
              'text-muted-foreground block font-normal',
              isRoomy ? 'text-sm' : 'text-[13px] leading-4',
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
      {hasChevron && (
        <ChevronRight
          className={join(
            'text-muted-foreground shrink-0',
            isRoomy ? 'mt-3 -ml-1 size-5' : 'size-4',
          )}
          aria-hidden='true'
        />
      )}
    </Button>
  );
  const frame = join(
    'border-border overflow-hidden rounded-2xl border',
    !isRoomy && 'bg-muted/50',
  );

  if (!hasTrailing) {
    return isGrouped ? button : <div className={frame}>{button}</div>;
  }

  return (
    <div className={join('flex items-center', !isGrouped && frame)}>
      {button}
      <span className='mr-1 flex size-10 shrink-0 items-center justify-center'>
        {trailing}
      </span>
    </div>
  );
}

export default ActionRow;
