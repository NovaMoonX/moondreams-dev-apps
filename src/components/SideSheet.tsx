import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { X } from 'lucide-react';


const CLOSE_MS = 200;
const SWIPE_CLOSE_PX = 72;
const PANEL_WIDTH_PX = 320;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SideSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** A function child gets `close`, which plays the exit before `onClose` runs; call it from a row that also navigates. */
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: ReactNode;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  isHorizontal: boolean;
  lastDx: number;
}

function SideSheetPanel({ onClose, title, children, footer }: Omit<SideSheetProps, 'isOpen'>) {
  const [isClosing, setIsClosing] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const close = () => {
    if (isClosing) {
      return;
    }
    setIsClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const root = document.documentElement;
    const { overflow, scrollbarGutter } = root.style;
    root.style.overflow = 'hidden';
    root.style.scrollbarGutter = 'stable';

    return () => {
      root.style.overflow = overflow;
      root.style.scrollbarGutter = scrollbarGutter;
      if (opener?.isConnected && !opener.matches('input, textarea, select, [contenteditable]')) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [opener]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        return;
      }
      if (!active || !panelRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  });

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isHorizontal: false,
      lastDx: 0,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.isHorizontal) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) {
        return;
      }
      drag.isHorizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.lastDx = dx;
    setDragX(Math.min(0, dx));
  };

  const handlePointerEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !drag.isHorizontal) {
      return;
    }
    setDragX(null);
    if (drag.lastDx < -SWIPE_CLOSE_PX) {
      close();
    }
  };

  const isDragging = dragX !== null;
  const translate = isClosing ? '-100%' : `${dragX ?? 0}px`;
  const scrimOpacity = isClosing ? 0 : Math.max(0, 1 + (dragX ?? 0) / PANEL_WIDTH_PX);

  return createPortal(
    <div
      className='fixed inset-0 z-[90] touch-pan-y'
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div
        aria-hidden='true'
        className={join(
          'side-sheet-scrim absolute inset-0 bg-black/40',
          !isDragging && 'transition-opacity duration-200 motion-reduce:transition-none',
        )}
        style={{ opacity: scrimOpacity }}
        onClick={close}
      />
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-label={title}
        className={join(
          'side-sheet-panel bg-background border-border absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] touch-pan-y flex-col overscroll-contain border-r shadow-xl',
          !isDragging && 'transition-transform duration-200 motion-reduce:transition-none',
        )}
        style={{ transform: `translateX(${translate})` }}
      >
        <div className='flex shrink-0 items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 pl-[max(1rem,env(safe-area-inset-left))]'>
          <h2 className='text-foreground text-xl font-semibold'>{title}</h2>
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            data-autofocus
            aria-label={`Close ${title.toLowerCase()}`}
            className='text-foreground! grid h-10 w-10 place-items-center rounded-full'
            onClick={close}
          >
            <X className='h-5 w-5' />
          </Button>
        </div>
        <div className='min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-4 pl-[max(1rem,env(safe-area-inset-left))]'>
          {typeof children === 'function' ? children(close) : children}
        </div>
        {footer && (
          <div className='border-border shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]'>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A panel that slides in from the left over a scrim: Escape, a scrim tap, a swipe left or the close button dismiss it. */
function SideSheet({ isOpen, ...panelProps }: SideSheetProps) {
  if (!isOpen) {
    return null;
  }

  return <SideSheetPanel {...panelProps} />;
}

export default SideSheet;
