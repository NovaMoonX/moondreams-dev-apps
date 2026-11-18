import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown } from 'lucide-react';

import StickyDivider from '@/components/StickyDivider';

interface DayHeaderProps {
  label: string;
  trailing?: ReactNode;
  /** On a phone the header rides under the app bar while its day is on screen. */
  isSticky: boolean;
  /** With `canOpen`, the label is a button that opens the day's details. */
  canOpen?: boolean;
  onOpen?: () => void;
}

/** A day's divider; on a phone it sticks under the app bar until the next day and turns into a compact bar. */
function DayHeader({ label, trailing, isSticky, canOpen, onOpen }: DayHeaderProps) {
  const labelNode = canOpen ? (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label={`${label}, details and add`}
      className="relative h-auto gap-1 px-1 font-medium text-inherit! before:absolute before:-inset-y-2 before:-inset-x-1 before:content-['']"
      onClick={onOpen}
    >
      {label}
      <ChevronDown className='h-3.5 w-3.5' aria-hidden='true' />
    </Button>
  ) : (
    label
  );

  if (!isSticky) {
    return (
      <div className='bg-primary/15 mt-2 flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-2'>
        <span className='text-foreground text-lg font-semibold tracking-tight [&>button]:text-lg [&>button]:font-semibold'>{labelNode}</span>
        {trailing}
      </div>
    );
  }

  return <StickyDivider label={labelNode} trailing={trailing} className='sticky-day-bar' />;
}

export default DayHeader;
