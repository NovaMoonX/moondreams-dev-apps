import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

const STARS = [1, 2, 3, 4, 5];
const MAX_STARS = STARS.length;
const STEP = 0.5;

interface StarRatingProps {
  /** 0.5 to 5 in half steps; null is no rating. */
  value: number | null;
  /** Omit for a read-only display. Tap or slide across the stars; a Clear button removes the rating. */
  onChange?: (value: number | null) => void;
  size?: 'sm' | 'lg';
}

const getStarFill = (star: number, value: number) =>
  Math.min(1, Math.max(0, value - (star - 1)));

const formatStars = (value: number) =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1);

function StarRating({ value, onChange, size = 'sm' }: StarRatingProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [preview, setPreview] = useState<number | null>(null);
  const iconClassName = size === 'lg' ? 'h-8 w-8' : 'h-3.5 w-3.5';
  const shown = preview ?? value ?? 0;

  const renderStars = (stars: number, isPreviewing = false) => (
    <>
      {STARS.map((star) => (
        <span key={star} className='relative inline-block'>
          <Star
            className={join(
              iconClassName,
              onChange ? 'text-muted-foreground' : 'text-muted-foreground/40',
            )}
          />
          <span
            className='absolute inset-y-0 left-0 overflow-hidden'
            style={{ width: `${getStarFill(star, stars) * 100}%` }}
          >
            <Star
              className={join(
                iconClassName,
                'max-w-none shrink-0 fill-current text-amber-500',
                isPreviewing && 'opacity-50',
              )}
            />
          </span>
        </span>
      ))}
    </>
  );

  if (!onChange) {
    return (
      <span
        className='inline-flex items-center gap-0.5'
        aria-label={`${formatStars(value ?? 0)} of ${MAX_STARS} stars`}
        role='img'
      >
        {renderStars(value ?? 0)}
      </span>
    );
  }

  const getValueAt = (clientX: number) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const result = Math.max(STEP, Math.ceil((ratio * MAX_STARS) / STEP) * STEP);
    return result;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    isDragging.current = true;
    setPreview(getValueAt(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const isHoveringWithMouse =
      event.pointerType === 'mouse' && !isDragging.current;
    if (!isDragging.current && !isHoveringWithMouse) return;

    const next = getValueAt(event.clientX);
    if (next !== preview) {
      setPreview(next);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;

    isDragging.current = false;
    const final = getValueAt(event.clientX);
    setPreview(event.pointerType === 'mouse' ? final : null);
    if (final !== null && final !== value) {
      onChange(final);
    }
  };

  const handlePointerCancel = () => {
    isDragging.current = false;
    setPreview(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = value ?? 0;
    const getNext = () => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        return Math.min(MAX_STARS, current + STEP);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        return current - STEP;
      }
      if (event.key === 'Home' || event.key === 'Backspace') return 0;
      if (event.key === 'End') return MAX_STARS;
      return null;
    };
    const next = getNext();
    if (next === null) return;

    event.preventDefault();
    setPreview(null);
    onChange(next < STEP ? null : next);
  };

  const isPreviewing = preview !== null && preview !== (value ?? 0);

  return (
    <div className='inline-flex flex-col items-center'>
      <div
        ref={rowRef}
        role='slider'
        tabIndex={0}
        aria-label='Your rating'
        aria-valuemin={0}
        aria-valuemax={MAX_STARS}
        aria-valuenow={value ?? 0}
        aria-valuetext={
          value === null
            ? 'No rating'
            : `${formatStars(value)} ${value === 1 ? 'star' : 'stars'}`
        }
        className={join(
          'focus-visible:ring-primary flex cursor-pointer touch-pan-y items-center gap-1 rounded-full px-1 outline-none select-none focus-visible:ring-2',
          size === 'lg' ? 'py-2' : 'py-1',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') {
            rowRef.current?.focus({ preventScroll: true });
          }
        }}
        onPointerLeave={() => !isDragging.current && setPreview(null)}
        onKeyDown={handleKeyDown}
      >
        {renderStars(shown, isPreviewing)}
      </div>
      {size === 'lg' && (
        <div className='text-muted-foreground flex h-6 items-center gap-2 text-sm'>
          {shown > 0 && (
            <span
              className={join('tabular-nums', isPreviewing && 'opacity-60')}
            >
              {formatStars(shown)}
            </span>
          )}
          {value !== null && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0 text-sm'
              onClick={() => onChange(null)}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default StarRating;
