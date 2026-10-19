import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

interface GroupRowProps {
  /** An emoji or a small icon, in a fixed column so every row's text starts on one edge. */
  icon?: ReactNode;
  children: ReactNode;
  /** Without one the row only states what it holds: no chevron, nothing to tap. */
  onClick?: () => void;
  ariaLabel?: string;
  /** For a view whose whole content is its rows: the icon in a 40px chip, body-size text and a row at least 64px tall, matching `ActionRow`'s `isRoomy`. */
  isRoomy?: boolean;
}

/** A row inside an `ActionGroup` that sums something up: an icon column, its content and a chevron on the first line, at least 40px tall; a tap opens what it sums up. */
function GroupRow({
  icon,
  children,
  onClick,
  ariaLabel,
  isRoomy = false,
}: GroupRowProps) {
  const getIconSlot = () => {
    if (icon === undefined) return null;
    if (isRoomy) {
      return (
        <span
          className='bg-accent text-accent-foreground mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-lg leading-none [&_svg]:size-5'
          aria-hidden='true'
        >
          {icon}
        </span>
      );
    }
    return (
      <span className='w-5 shrink-0 text-center' aria-hidden='true'>
        {icon}
      </span>
    );
  };
  const iconSlot = getIconSlot();
  const layout = join(
    'flex w-full items-start justify-start gap-3 text-left font-normal whitespace-normal',
    isRoomy ? 'min-h-16 px-3 py-3 text-base' : 'min-h-10 px-4 py-2.5 text-sm',
  );
  const body = (
    <>
      {iconSlot}
      <span
        className={join(
          'min-w-0 flex-1',
          isRoomy && 'flex min-h-11 flex-col justify-center',
        )}
      >
        {children}
      </span>
      {onClick !== undefined && (
        <ChevronRight
          className={join(
            'text-muted-foreground shrink-0',
            isRoomy ? 'mt-3 -ml-1 size-5' : 'mt-0.5 size-4',
          )}
          aria-hidden='true'
        />
      )}
    </>
  );

  if (onClick === undefined) {
    return <div className={join(layout, 'text-foreground')}>{body}</div>;
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      size='stripped'
      rounded='none'
      aria-label={ariaLabel}
      onClick={onClick}
      className={join(
        'text-foreground! hover:bg-muted focus-visible:rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2',
        layout,
      )}
    >
      {body}
    </Button>
  );
}

export default GroupRow;
