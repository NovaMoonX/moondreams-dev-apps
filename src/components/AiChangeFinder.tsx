import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

import type { useChangeFinder } from '@/hooks/useChangeFinder';

interface AiChangeFinderProps {
  finder: ReturnType<typeof useChangeFinder>;
  className?: string;
}

const ARROW_CLASS =
  "relative size-8 shrink-0 before:absolute before:-inset-1 before:content-['']";

/** One line saying how many marked changes are still to be looked at, with jumps to the one above and below; nothing while there are none. */
function AiChangeFinder({ finder, className }: AiChangeFinderProps) {
  if (finder.total === 0) return null;
  const getLabel = () => {
    if (finder.unseen === 0) {
      return finder.total === 1
        ? 'You’ve seen the change'
        : `You’ve seen all ${finder.total} changes`;
    }
    return finder.unseen === 1
      ? '1 change left to see'
      : `${finder.unseen} changes left to see`;
  };
  return (
    <div className={join('flex items-center gap-2', className)}>
      <Sparkles
        className='h-3.5 w-3.5 shrink-0 text-[var(--ai-mark)]'
        aria-hidden='true'
      />
      <p className='min-w-0 flex-1 truncate text-xs'>{getLabel()}</p>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        className={ARROW_CLASS}
        aria-label='Go to the change above'
        disabled={!finder.hasAbove}
        onClick={finder.goAbove}
      >
        <ChevronUp className='h-4 w-4' aria-hidden='true' />
      </Button>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        className={ARROW_CLASS}
        aria-label='Go to the change below'
        disabled={!finder.hasBelow}
        onClick={finder.goBelow}
      >
        <ChevronDown className='h-4 w-4' aria-hidden='true' />
      </Button>
    </div>
  );
}

export default AiChangeFinder;
