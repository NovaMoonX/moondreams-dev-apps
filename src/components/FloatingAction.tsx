import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { hasDialogOnTop } from '@/utils/dialogUtils';

const GAP_PX = 12;
const SHRINK_AFTER_PX = 96;
const SCROLL_STEP_PX = 6;

const isCoveredNow = () =>
  document.documentElement.hasAttribute('data-subview-open') ||
  hasDialogOnTop();

const REST_PX = 8;

/** Whether any list row sits under the pill's box, so a figure or chevron is never covered at rest. */
const isOverRow = (pill: HTMLElement | null) => {
  if (!pill) return false;
  const box = pill.getBoundingClientRect();
  return [...document.querySelectorAll<HTMLElement>('li, [data-row]')].some(
    (row) => {
      if (row.closest('[data-bottom-bar], [role="dialog"]')) return false;
      const rect = row.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > box.top &&
        rect.top < box.bottom &&
        rect.right > box.left &&
        rect.left < box.right
      );
    },
  );
};

const getBarHeight = () =>
  document.querySelector<HTMLElement>('[data-bottom-bar]')?.offsetHeight ?? 0;

interface FloatingActionProps {
  /** Always the accessible name; drawn at rest and dropped to the icon while scrolling down. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Column the pill lines up with from `sm` up. */
  columnClassName?: string;
}

/** The screen's one add action: a filled pill above the bottom bar, hidden under a sheet, drawer or subview. Leaves a spacer so the last row scrolls clear of it. */
function FloatingAction({
  label,
  icon,
  onClick,
  columnClassName = 'max-w-4xl',
}: FloatingActionProps) {
  const [isCovered, setIsCovered] = useState(isCoveredNow);
  const [isCompact, setIsCompact] = useState(false);
  const [barHeight, setBarHeight] = useState(getBarHeight);
  const [isAtRest, setIsAtRest] = useState(() => window.scrollY <= REST_PX);
  const [isOverRowNow, setIsOverRowNow] = useState(false);
  const pillRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const update = () => {
      setIsCovered(isCoveredNow());
      setBarHeight(getBarHeight());
      setIsOverRowNow(isOverRow(pillRef.current));
    };
    // A busy page mutates often; the check reads layout, so it runs at most once a frame.
    const queued = { frame: 0 };
    const queueUpdate = () => {
      if (queued.frame !== 0) return;
      queued.frame = requestAnimationFrame(() => {
        queued.frame = 0;
        update();
      });
    };
    const observer = new MutationObserver(queueUpdate);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-subview-open'],
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-drawer-open', 'data-panel-open', 'inert'],
    });
    window.addEventListener('resize', queueUpdate);
    queueUpdate();
    return () => {
      cancelAnimationFrame(queued.frame);
      observer.disconnect();
      window.removeEventListener('resize', queueUpdate);
    };
  }, []);

  useEffect(() => {
    const state = { last: window.scrollY };
    const handleScroll = () => {
      const current = window.scrollY;
      setIsAtRest(current <= REST_PX);
      if (current <= REST_PX) setIsOverRowNow(isOverRow(pillRef.current));
      const delta = current - state.last;
      if (Math.abs(delta) < SCROLL_STEP_PX) return;
      state.last = current;
      setIsCompact(delta > 0 && current > SHRINK_AFTER_PX);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <div className='h-12' aria-hidden='true' />
      {!isCovered && (
        <div
          className='pointer-events-none fixed inset-x-0 z-30 px-4'
          style={{
            bottom:
              barHeight > 0
                ? barHeight + GAP_PX
                : 'calc(1rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className={join('mx-auto flex justify-end', columnClassName)}>
            <span
              ref={pillRef}
              className={join('flex', isAtRest && isOverRowNow && 'invisible')}
            >
              <Button
                type='button'
                rounded='full'
                aria-label={label}
                onClick={onClick}
                className='pointer-events-auto h-12 min-w-12 gap-0 px-4 shadow-lg'
              >
                {icon}
                <span
                  className={join(
                    'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 motion-reduce:transition-none',
                    isCompact
                      ? 'max-w-0 opacity-0'
                      : 'ml-2 max-w-64 opacity-100',
                  )}
                >
                  {label}
                </span>
              </Button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

export default FloatingAction;
