import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';

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
  const ref = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
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

  useEffect(() => {
    const element = ref.current;
    const day = element?.parentElement;
    if (!isSticky || !element || !day) {
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stickTop = parseFloat(getComputedStyle(element).top);
        setIsStuck(element.getBoundingClientRect().top <= stickTop + 0.5);
      });
    };
    // Only a day that is on screen is measured, so skipped (off-screen) days are never forced to lay out.
    const observer = new IntersectionObserver(([entry]) => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (entry?.isIntersecting) {
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
      }
    });
    observer.observe(day);
    element.addEventListener('transitionend', update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('transitionend', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isSticky]);

  if (!isSticky) {
    return (
      <div className='border-primary/25 bg-primary/10 border-l-primary flex min-h-11 items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-2'>
        <span className='text-foreground text-base font-semibold'>{labelNode}</span>
        {trailing}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={join(
        'sticky-day-bar flex min-h-10 items-center border-b border-transparent px-1',
        isStuck && 'bg-background/80 border-border backdrop-blur',
      )}
    >
      {isStuck ? (
        <div className='flex w-full min-w-0 items-center justify-center gap-2'>
          <span className='text-foreground truncate text-sm font-semibold'>{labelNode}</span>
          {trailing}
        </div>
      ) : (
        <SectionDivider label={labelNode} trailing={trailing} className='w-full' />
      )}
    </div>
  );
}

export default DayHeader;
