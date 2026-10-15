import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleHelp, TriangleAlert } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

const TIP_GAP_PX = 10;
const TIP_MARGIN_PX = 8;
const ARROW_INSET_PX = 14;
const SETTLE_FRAMES = 24;
const CAN_HOVER_QUERY = '(hover: hover) and (pointer: fine)';

const subscribeToHover = (onChange: () => void) => {
  const query = window.matchMedia(CAN_HOVER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getCanHover = () => window.matchMedia(CAN_HOVER_QUERY).matches;

// A dialog moves focus to its first control on its own, which is also `:focus-visible` after Enter, so
// focus only counts as the person's when the key before it was Tab.
const lastKey = { isTab: false };
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (event) => {
      lastKey.isTab = event.key === 'Tab';
    },
    true,
  );
  window.addEventListener('pointerdown', () => (lastKey.isTab = false), true);
}

interface HelpTipProps {
  title: string;
  children: ReactNode;
  /** Shows this text as an inline link that opens the explanation in a modal at every size, instead of the help icon. */
  linkLabel?: string;
  /** Which side of the icon the tooltip prefers on a computer; it flips when that side has no room. */
  placement?: 'top' | 'bottom';
  /** A caution ("this number leaves something out") instead of a question mark; opens the same way. */
  variant?: 'help' | 'warning';
  /** The modal's dismiss button, for a screen where "Got it" already names something else. */
  dismissLabel?: string;
  className?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function placeTooltip(
  trigger: HTMLElement,
  tip: HTMLElement,
  arrow: HTMLElement,
  placement: 'top' | 'bottom',
) {
  const rect = trigger.getBoundingClientRect();
  const { width, height } = tip.getBoundingClientRect();
  const fitsBelow =
    rect.bottom + TIP_GAP_PX + height + TIP_MARGIN_PX <= window.innerHeight;
  const fitsAbove = rect.top - TIP_GAP_PX - height - TIP_MARGIN_PX >= 0;
  const prefersBelow = placement === 'bottom';
  const isBelow = prefersBelow
    ? fitsBelow || !fitsAbove
    : !fitsAbove && fitsBelow;
  const center = rect.left + rect.width / 2;
  const left = clamp(
    center - width / 2,
    TIP_MARGIN_PX,
    window.innerWidth - width - TIP_MARGIN_PX,
  );

  tip.style.left = `${left}px`;
  tip.style.top = `${isBelow ? rect.bottom + TIP_GAP_PX : rect.top - TIP_GAP_PX - height}px`;
  arrow.style.left = `${clamp(center - left, ARROW_INSET_PX, width - ARROW_INSET_PX)}px`;
  arrow.dataset.side = isBelow ? 'below' : 'above';
}

/** A "what does this mean?" explainer: a help icon that opens a modal on a phone or any touch screen and a hover/focus tooltip with a mouse, or an inline link that opens the modal at every size. */
function HelpTip({
  title,
  children,
  linkLabel,
  placement = 'bottom',
  variant = 'help',
  dismissLabel = 'Got it',
  className,
}: HelpTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const canHover = useSyncExternalStore(
    subscribeToHover,
    getCanHover,
    () => true,
  );
  const usesModal = Boolean(linkLabel) || isPhone || !canHover;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const isTipShown = isOpen && !usesModal;

  // A modal or tooltip can sit over a drawer, and both close on one Escape: capture it so only it does.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isTipShown) return;

    const place = () => {
      const trigger = triggerRef.current;
      const tip = tipRef.current;
      const arrow = arrowRef.current;
      if (trigger && tip && arrow) placeTooltip(trigger, tip, arrow, placement);
    };
    place();
    let frame = 0;
    let settleId = 0;
    const settle = () => {
      place();
      frame += 1;
      if (frame < SETTLE_FRAMES) settleId = requestAnimationFrame(settle);
    };
    settleId = requestAnimationFrame(settle);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(settleId);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isTipShown, placement]);

  const body = <div className='space-y-2 text-left text-sm'>{children}</div>;

  const modal = (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={title}
      className='border-border border'
    >
      <div className='space-y-4'>
        {body}
        <div className='flex justify-end'>
          <Button type='button' rounded='full' onClick={() => setIsOpen(false)}>
            {dismissLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (linkLabel) {
    return (
      <>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={join(
            'inline! h-auto! min-h-0! p-0! align-baseline text-xs underline',
            className,
          )}
          onClick={() => setIsOpen(true)}
        >
          {linkLabel}
        </Button>
        {modal}
      </>
    );
  }

  const trigger = (
    <Button
      ref={triggerRef}
      type='button'
      variant='tertiary'
      size='icon'
      rounded='full'
      aria-label={`${variant === 'warning' ? 'Heads up' : 'Help'}: ${title}`}
      aria-describedby={isTipShown ? tipId : undefined}
      className={join(
        "relative -my-1 h-5 w-5 after:absolute after:-inset-2.5 after:content-['']",
        className,
      )}
      onClick={() => setIsOpen(true)}
      onPointerEnter={
        usesModal
          ? undefined
          : (event) => event.pointerType === 'mouse' && setIsOpen(true)
      }
      onPointerLeave={
        usesModal
          ? undefined
          : (event) => event.pointerType === 'mouse' && setIsOpen(false)
      }
      onFocus={
        usesModal
          ? undefined
          : (event) =>
              lastKey.isTab &&
              event.currentTarget.matches(':focus-visible') &&
              setIsOpen(true)
      }
      onBlur={usesModal ? undefined : () => setIsOpen(false)}
    >
      {variant === 'warning' ? (
        <TriangleAlert className='text-warning h-3.5 w-3.5' />
      ) : (
        <CircleHelp className='text-muted-foreground h-3.5 w-3.5' />
      )}
    </Button>
  );

  return (
    <>
      {trigger}
      {usesModal && modal}
      {isTipShown &&
        createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role='tooltip'
            className='bg-tooltip text-tooltip-foreground border-border pointer-events-none fixed top-0 left-0 z-[100] w-64 max-w-[calc(100vw-1rem)] rounded-lg border px-3 py-2 text-left shadow-lg'
          >
            <span
              ref={arrowRef}
              aria-hidden
              className='bg-tooltip border-border absolute size-2 -translate-x-1/2 rotate-45 data-[side=above]:-bottom-1 data-[side=above]:border-r data-[side=above]:border-b data-[side=below]:-top-1 data-[side=below]:border-t data-[side=below]:border-l'
            />
            <div className='space-y-1'>
              <p className='text-sm font-semibold'>{title}</p>
              {body}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default HelpTip;
