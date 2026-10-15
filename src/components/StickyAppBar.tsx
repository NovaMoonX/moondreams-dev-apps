import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface StickyAppBarProps {
  /** The back control, always first. */
  leading: ReactNode;
  /** Quick actions on the right (alerts, share, a menu). */
  trailing?: ReactNode;
  /** Slides in beside the back control, on one line, once the bar has stuck to the top of the screen. */
  title: string;
  /** The page's own title: the bar's copy appears once half of it has scrolled under the bar, and leaves as soon as half of it is back. */
  titleRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/** A mini-app header row on a phone that keeps back navigation on screen, and shows `title` beside it once stuck. */
function StickyAppBar({ leading, trailing, title, titleRef, className }: StickyAppBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [isTitleShown, setIsTitleShown] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const bar = barRef.current;
      if (!bar) {
        return;
      }
      const stuckTop = parseFloat(getComputedStyle(bar).top) || 0;
      const barRect = bar.getBoundingClientRect();
      const stuck = window.scrollY > 0 && barRect.top <= stuckTop + 1;
      const anchor = titleRef?.current?.getBoundingClientRect();
      setIsStuck(stuck);
      setIsTitleShown(anchor ? anchor.top + anchor.height / 2 < barRect.bottom : stuck);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [titleRef]);

  return (
    <div
      ref={barRef}
      className={join(
        'sticky-app-bar -mx-4 flex min-h-14 items-center justify-between gap-2 border-b border-transparent px-4 py-2.5',
        isStuck && 'bg-background/80 border-border backdrop-blur',
        className,
      )}
    >
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {leading}
        <p
          aria-hidden={!isTitleShown}
          className={join(
            'min-w-0 flex-1 truncate text-base font-semibold transition-all duration-200',
            isTitleShown ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0',
          )}
        >
          {title}
        </p>
      </div>
      {trailing}
    </div>
  );
}

export default StickyAppBar;
