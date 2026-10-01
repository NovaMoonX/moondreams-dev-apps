import { useRef, useState, type PointerEvent } from 'react';

import { Button, type ToastData } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { X } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { TOAST_APP_LABELS, TOAST_TYPE_STYLES } from '@components/toastTypeStyles';

const SWIPE_DISMISS_THRESHOLD_PX = 80;
const CLICK_MOVEMENT_THRESHOLD_PX = 5;

interface AppToastProps extends Omit<ToastData, 'type'> {
  /** Loosened from `ToastData`'s `ToastType`: `addToast` accepts any string, including
   * our own `'reminder'` type, and passes it through unchanged. */
  type?: string;
}

/** Renders every toast app-wide, not just reminders — passed as `ToastProvider`'s
 * `customComponent`. `onRemove` is already the real removal function, and auto-dismiss
 * via `duration` is already handled upstream before this ever renders. */
function AppToast({ id, title, description, type, action, onRemove }: AppToastProps) {
  const style = TOAST_TYPE_STYLES[type ?? 'info'] ?? TOAST_TYPE_STYLES.info;
  const isReminder = type === 'reminder';
  const appLabel = TOAST_APP_LABELS.get(id);
  const isSmallScreen = useMediaQuery().isBelow('sm');
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
        !isSmallScreen && 'pr-8',
        style.className,
      )}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {style.icon && <div className='mt-0.5 shrink-0'>{style.icon}</div>}
      <div className='min-w-0 flex-1'>
        {appLabel && (
          <div className='text-xs leading-4 font-bold tracking-wide uppercase opacity-60'>
            {appLabel}
          </div>
        )}
        <div className='text-sm leading-5 font-medium'>{title}</div>
        {description && <div className='mt-1 text-sm leading-5 opacity-90'>{description}</div>}
      </div>
      {!isSmallScreen && (
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label='Dismiss'
          className='absolute top-1.5 right-1.5 h-6 w-6 bg-transparent! opacity-60 hover:opacity-100'
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.(id);
          }}
        >
          <X className='h-3.5 w-3.5' />
        </Button>
      )}
    </div>
  );
}

export default AppToast;
