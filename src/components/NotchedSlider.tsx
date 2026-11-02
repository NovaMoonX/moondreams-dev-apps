import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface NotchedSliderOption<T extends string> {
  value: T;
  label: string;
  ariaLabel: string;
}

interface NotchedSliderProps<T extends string> {
  label: string;
  options: readonly NotchedSliderOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  knobClassName?: string;
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
};

/** A small rounded slider that snaps to a few labelled notches like a wizard's steps, dragged or tapped on touch; for a setting that reads as a scale from less to more. */
function NotchedSlider<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  knobClassName,
}: NotchedSliderProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragAt, setDragAt] = useState<number | null>(null);
  const last = Math.max(options.length - 1, 1);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const at = dragAt ?? index / last;
  const isDragging = dragAt !== null;
  const position = (fraction: number) => `${fraction * 100}%`;

  const choose = (nextIndex: number) => {
    const option = options[Math.min(last, Math.max(0, nextIndex))];
    if (option && option.value !== value) onChange(option.value);
  };
  const follow = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    setDragAt(fraction);
    choose(Math.round(fraction * last));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    follow(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isDragging) follow(event.clientX);
  };
  const onPointerEnd = () => setDragAt(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      choose(event.key === 'Home' ? 0 : last);
      return;
    }
    const step = KEY_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    choose(index + step);
  };

  return (
    <div
      role='slider'
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={options[index]?.ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className={join(
        "group relative w-28 shrink-0 cursor-pointer touch-none px-3 pt-1.5 select-none before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] focus-visible:outline-none",
        className,
      )}
    >
      <div ref={trackRef} className='relative h-5'>
        <span className='bg-muted-foreground/25 absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full' />
        <span
          className={join(
            'bg-primary absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full',
            !isDragging && 'transition-[width] duration-150 ease-out',
          )}
          style={{ width: position(at) }}
        />
        {options.map((option, i) => (
          <span
            key={option.value}
            className={join(
              'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
              i / last <= at
                ? 'bg-primary border-primary'
                : 'bg-background border-muted-foreground/40',
            )}
            style={{ left: position(i / last) }}
          />
        ))}
        <span
          className={join(
            'bg-background border-primary group-focus-visible:ring-primary/60 absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] shadow-sm group-focus-visible:ring-2',
            isDragging
              ? 'scale-110'
              : 'transition-[left] duration-150 ease-out',
            knobClassName,
          )}
          style={{ left: position(at) }}
        />
      </div>
      <div aria-hidden='true' className='relative h-3.5'>
        {options.map((option, i) => (
          <span
            key={option.value}
            className={join(
              'absolute top-0 -translate-x-1/2 text-[10px] leading-3.5 whitespace-nowrap',
              i === index
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground',
            )}
            style={{ left: position(i / last) }}
          >
            {option.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default NotchedSlider;
