import { useRef, useState, type PointerEvent } from 'react';

import type { ToastData } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { TOAST_TYPE_STYLES } from '@components/toastTypeStyles';

const SWIPE_DISMISS_THRESHOLD_PX = 80;
const CLICK_MOVEMENT_THRESHOLD_PX = 5;

interface AppToastProps extends Omit<ToastData, 'type'> {
  /** Loosened from `ToastData`'s `ToastType`: `addToast` accepts any string, including
   * our own `'reminder'` type, and passes it through unchanged. */
  type?: string;
}

/** The app-wide toast renderer, wired in as Dreamer UI's `ToastProvider` `customComponent` —
 * every toast in the app (CRUD feedback and reminder notifications alike) renders through
 * this, styled with the app's own surface tokens instead of Dreamer's defaults, and
 * swipeable in any direction. `onRemove` is the provider's real `removeToast`, and
 * auto-dismiss (via `duration`) is already handled by Dreamer UI's wrapper before this
 * component ever renders. */
function AppToast({ id, title, description, type, action, onRemove }: AppToastProps) {
  const style = TOAST_TYPE_STYLES[type ?? 'info'] ?? TOAST_TYPE_STYLES.info;
  const isReminder = type === 'reminder';
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) {
      return;
    }
    setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
  };

  const handlePointerUp = () => {
    const dragStart = dragStartRef.current;
    dragStartRef.current = null;
    setIsDragging(false);
    if (!dragStart) {
      return;
    }

    const distance = Math.hypot(offset.x, offset.y);
    if (distance > SWIPE_DISMISS_THRESHOLD_PX) {
      onRemove?.(id);
      return;
    }
    if (distance < CLICK_MOVEMENT_THRESHOLD_PX && isReminder) {
      action?.onClick();
      onRemove?.(id);
      return;
    }
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? undefined : 'polite'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={join(
        'relative flex touch-none items-start gap-3 rounded-lg border p-4 shadow-lg select-none',
        !isDragging && 'transition-transform duration-200 ease-out',
        isReminder && 'cursor-pointer',
        style.className,
      )}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {style.icon && <div className='mt-0.5 shrink-0'>{style.icon}</div>}
      <div className='min-w-0 flex-1'>
        <div className='text-sm leading-5 font-medium'>{title}</div>
        {description && <div className='mt-1 text-sm leading-5 opacity-90'>{description}</div>}
      </div>
    </div>
  );
}

export default AppToast;
