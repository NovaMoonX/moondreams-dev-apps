import { useEffect, useRef, useState, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionDivider from '@/components/SectionDivider';

interface StickyDividerProps {
  label: ReactNode;
  trailing?: ReactNode;
  /** Positions it: `sticky`, its `top` and `z-*` (a shared utility such as `sticky-day-bar`, or the screen's own). */
  className: string;
  /** Added while stuck, such as an opaque fill under an opaque header. */
  stuckClassName?: string;
}

/** A group's divider that rides along while the page scrolls, as a compact centered bar, until the next group's takes over. Window scroll only. */
function StickyDivider({
  label,
  trailing,
  className,
  stuckClassName,
}: StickyDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const element = ref.current;
    const group = element?.parentElement;
    if (!element || !group) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stickTop = parseFloat(getComputedStyle(element).top);
        setIsStuck(element.getBoundingClientRect().top <= stickTop + 0.5);
      });
    };
    // Only a group that is on screen is measured, so off-screen groups are never forced to lay out.
    const observer = new IntersectionObserver(([entry]) => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (entry?.isIntersecting) {
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
      }
    });
    observer.observe(group);
    element.addEventListener('transitionend', update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('transitionend', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={join(
        'flex min-h-10 items-center border-b border-transparent px-1',
        isStuck && 'bg-background/80 border-border backdrop-blur',
        className,
        isStuck && stuckClassName,
      )}
    >
      {isStuck ? (
        <div className='flex w-full min-w-0 items-center justify-center gap-2'>
          <span className='text-foreground truncate text-sm font-semibold'>
            {label}
          </span>
          {trailing}
        </div>
      ) : (
        <SectionDivider label={label} trailing={trailing} className='w-full' />
      )}
    </div>
  );
}

export default StickyDivider;
