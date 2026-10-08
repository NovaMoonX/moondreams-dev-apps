import { useEffect, useRef, useState, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionDivider from '@/components/SectionDivider';

interface DayHeaderProps {
  label: string;
  trailing?: ReactNode;
  /** On a phone the header rides under the app bar while its day is on screen. */
  isSticky: boolean;
}

/** A day's divider; on a phone it sticks under the app bar until the next day and turns into a compact bar. */
function DayHeader({ label, trailing, isSticky }: DayHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!isSticky || !element) {
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
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isSticky]);

  if (!isSticky) {
    return <SectionDivider label={label} trailing={trailing} />;
  }

  return (
    <div
      ref={ref}
      className={join(
        'sticky-day-bar flex min-h-10 items-center px-1 transition-colors',
        isStuck && 'bg-background/80 border-border border-b backdrop-blur',
      )}
    >
      {isStuck ? (
        <div className='flex w-full min-w-0 items-center justify-center gap-2'>
          <span className='text-foreground truncate text-sm font-semibold'>{label}</span>
          {trailing}
        </div>
      ) : (
        <SectionDivider label={label} trailing={trailing} className='w-full' />
      )}
    </div>
  );
}

export default DayHeader;
