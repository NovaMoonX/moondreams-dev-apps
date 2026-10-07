import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

interface SlimTimelineRowProps {
  emoji: string;
  label: string;
  name?: string;
  /** Already formatted, e.g. "3:00 PM". */
  time?: string;
  ariaLabel: string;
  className?: string;
  onOpen: () => void;
}

/** One quiet line on the timeline that opens its details on tap. */
function SlimTimelineRow({ emoji, label, name, time, ariaLabel, className, onOpen }: SlimTimelineRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-label={ariaLabel}
      title={name ? `${label} · ${name}` : label}
      onClick={onOpen}
      className={join(
        'bg-muted/60 border-border/60 text-foreground h-auto min-h-11 w-full justify-start gap-3 rounded-lg border px-3 py-2 text-left text-sm font-normal',
        className,
      )}
    >
      <span className='w-5 shrink-0 text-center' aria-hidden='true'>
        {emoji}
      </span>
      <span className='min-w-0 flex-1 truncate'>
        <span className='font-medium'>{label}</span>
        {name && <span className='text-muted-foreground'> · {name}</span>}
      </span>
      {time && <span className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'>{time}</span>}
      <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
    </Button>
  );
}

export default SlimTimelineRow;
