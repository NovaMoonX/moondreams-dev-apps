import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface DoughnutSegment {
  id: string;
  label: string;
  value: number;
  /** A `stroke-*` class for this segment's arc. */
  className: string;
  /** Names the segment's value for the hover title, e.g. "5,120 documents". */
  valueText?: string;
}

interface DoughnutProps {
  segments: DoughnutSegment[];
  /** What the whole circle stands for. Leave it out for a full circle split between the segments; a larger number leaves the rest of the ring empty. */
  total?: number;
  /** Pixel size of the square chart. */
  size?: number;
  ariaLabel: string;
  /** Shown in the hole. */
  center?: ReactNode;
  className?: string;
}

const RADIUS = 15.9155; // a circumference of 100 units, so lengths are percentages
const STROKE = 4;
const GAP = 1.2; // the surface-coloured gap between neighbouring arcs

/** A ring of arcs. With no `total` it is always a full circle (shares of a whole); with a `total` it fills only as far as the segments reach (progress toward a limit). */
function Doughnut({ segments, total, size = 160, ariaLabel, center, className }: DoughnutProps) {
  const positive = segments.filter((segment) => segment.value > 0);
  const sum = positive.reduce((running, segment) => running + segment.value, 0);
  const whole = Math.max(total ?? sum, sum);
  const isSingleProgress = total !== undefined && positive.length === 1;
  const gap = positive.length > 1 ? GAP : 0;

  const arcs = positive.reduce<{ segment: DoughnutSegment; length: number; offset: number }[]>((placed, segment) => {
    const used = placed.reduce((running, arc) => running + (arc.length + gap), 0);
    const length = Math.max(0, (segment.value / whole) * 100 - gap);
    return [...placed, { segment, length, offset: used }];
  }, []);

  return (
    <div className={join('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox='0 0 36 36' role='img' aria-label={ariaLabel} className='size-full -rotate-90'>
        <circle cx='18' cy='18' r={RADIUS} fill='none' strokeWidth={STROKE} className='stroke-muted' />
        {arcs.map(({ segment, length, offset }) => (
          <circle
            key={segment.id}
            cx='18'
            cy='18'
            r={RADIUS}
            fill='none'
            strokeWidth={STROKE}
            strokeLinecap={isSingleProgress ? 'round' : 'butt'}
            strokeDasharray={`${length} ${100 - length}`}
            strokeDashoffset={-offset}
            className={segment.className}
          >
            <title>{`${segment.label}: ${segment.valueText ?? segment.value}`}</title>
          </circle>
        ))}
      </svg>
      {center ? (
        <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center'>
          {center}
        </div>
      ) : null}
    </div>
  );
}

export default Doughnut;
