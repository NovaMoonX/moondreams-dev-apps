import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

type Ends = readonly [number, number];

interface RangeSliderProps {
  /** Names the whole range for a screen reader ("Amount range"). */
  label: string;
  /** Names each handle ("Lowest amount", "Highest amount"). */
  handleLabels: readonly [string, string];
  min: number;
  max: number;
  step?: number;
  value: Ends;
  /** Runs while a handle moves. */
  onChange: (value: Ends) => void;
  /** Runs once a drag or key press settles, for work that should not follow every step. */
  onCommit?: (value: Ends) => void;
  /** How a value reads to a screen reader. */
  formatValue?: (value: number) => string;
  className?: string;
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
};
const PAGE_KEYS: Record<string, number> = { PageDown: -1, PageUp: 1 };

/** A slider with two handles that picks a low and a high value between a minimum and a maximum, dragged on touch or moved with the keys; the handles never cross. */
function RangeSlider({
  label,
  handleLabels,
  min,
  max,
  step = 1,
  value,
  onChange,
  onCommit,
  formatValue = String,
  className,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);
  // A drag reads and commits what it last sent, since the next render may not have landed yet.
  const dragged = useRef<Ends>(value);
  const span = Math.max(max - min, step);
  const pageStep = Math.max(step, Math.round(span / 10 / step) * step);
  const snap = (raw: number) =>
    Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step));
  const fractionOf = (at: number) =>
    (Math.min(max, Math.max(min, at)) - min) / span;
  const position = (at: number) => `${fractionOf(at) * 100}%`;

  const withHandle = (handle: 0 | 1, raw: number, from: Ends = value): Ends => {
    const next = snap(raw);
    return handle === 0
      ? [Math.min(next, from[1]), from[1]]
      : [from[0], Math.max(next, from[0])];
  };
  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const fraction = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    return min + fraction * span;
  };
  const nearestHandle = (at: number): 0 | 1 => {
    if (value[0] === value[1]) return at < value[0] ? 0 : 1;
    return Math.abs(at - value[0]) <= Math.abs(at - value[1]) ? 0 : 1;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const at = valueAt(event.clientX);
    if (at === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = nearestHandle(at);
    setDragging(handle);
    dragged.current = withHandle(handle, at);
    onChange(dragged.current);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    const at = valueAt(event.clientX);
    if (at === null) return;
    dragged.current = withHandle(dragging, at, dragged.current);
    onChange(dragged.current);
  };
  const onPointerEnd = () => {
    if (dragging === null) return;
    setDragging(null);
    onCommit?.(dragged.current);
  };
  const onKeyDown =
    (handle: 0 | 1) => (event: KeyboardEvent<HTMLDivElement>) => {
      const current = value[handle];
      const target =
        event.key === 'Home'
          ? min
          : event.key === 'End'
            ? max
            : PAGE_KEYS[event.key] !== undefined
              ? current + PAGE_KEYS[event.key] * pageStep
              : KEY_STEPS[event.key] === undefined
                ? null
                : current + KEY_STEPS[event.key] * step;
      if (target === null) return;
      event.preventDefault();
      const next = withHandle(handle, target);
      onChange(next);
      onCommit?.(next);
    };

  return (
    <div
      role='group'
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={onPointerEnd}
      className={join(
        'relative cursor-pointer touch-none px-3 py-3 select-none',
        className,
      )}
    >
      <div ref={trackRef} className='relative h-5'>
        <span className='bg-muted-foreground/25 absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full' />
        <span
          className='bg-primary absolute top-1/2 h-1 -translate-y-1/2 rounded-full'
          style={{
            left: position(value[0]),
            width: `${(fractionOf(value[1]) - fractionOf(value[0])) * 100}%`,
          }}
        />
        {([0, 1] as const).map((handle) => (
          <div
            key={handle}
            role='slider'
            tabIndex={0}
            aria-label={handleLabels[handle]}
            aria-valuemin={handle === 0 ? min : value[0]}
            aria-valuemax={handle === 0 ? value[1] : max}
            aria-valuenow={value[handle]}
            aria-valuetext={formatValue(value[handle])}
            onKeyDown={onKeyDown(handle)}
            className={join(
              "bg-background border-primary focus-visible:ring-primary/60 absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] shadow-sm before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:outline-none",
              dragging === handle && 'scale-110',
              value[0] === value[1] && handle === 1 && 'z-10',
            )}
            style={{ left: position(value[handle]) }}
          />
        ))}
      </div>
    </div>
  );
}

export default RangeSlider;
