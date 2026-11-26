import { join } from '@moondreamsdev/dreamer-ui/utils';
import type { ReactNode } from 'react';

import type { PepperLook } from '@apps/pinch/types';

export type PepperFaceLook = Exclude<PepperLook, 'ORB'>;

interface PepperFaceProps {
  look: PepperFaceLook;
}

const FACE_STROKE = {
  fill: 'none',
  strokeLinecap: 'round',
  stroke: 'var(--pepper-pupil)',
} as const;

/** The peppercorn every look shares: its body, its sheen and its leaf. Bright eyes keeps its first, rounder leaf. */
function Corn({ isBright = false }: { isBright?: boolean }) {
  return (
    <>
      <circle cx='50' cy='54' r='34' fill='var(--pepper-warm)' />
      <ellipse
        cx='37'
        cy='38'
        rx='9'
        ry='5'
        fill='var(--pepper-warm-hi)'
        opacity={isBright ? '.7' : '.6'}
        transform='rotate(-32 37 38)'
      />
      {isBright ? (
        <>
          <path
            d='M50 21c0-5 2-8 6-10'
            stroke='var(--pepper-stem)'
            strokeWidth='3'
            fill='none'
            strokeLinecap='round'
          />
          <ellipse
            cx='59'
            cy='12'
            rx='6'
            ry='3.2'
            fill='var(--pepper-stem)'
            transform='rotate(-25 59 12)'
          />
        </>
      ) : (
        <>
          <path
            d='M50 21c0-4 1.5-6.5 4.5-8'
            stroke='var(--pepper-stem)'
            strokeWidth='2.6'
            fill='none'
            strokeLinecap='round'
          />
          <ellipse
            cx='57.5'
            cy='12.5'
            rx='4.6'
            ry='2.4'
            fill='var(--pepper-stem)'
            transform='rotate(-25 57.5 12.5)'
          />
        </>
      )}
    </>
  );
}

/** The closed smile and the open mouth that takes its place while Pepper speaks. */
function Mouth({
  smile,
  strokeWidth,
  cy,
  rx,
  ry,
}: {
  smile: string;
  strokeWidth: string;
  cy: string;
  rx: string;
  ry: string;
}) {
  return (
    <>
      <path
        className='face-smile'
        d={smile}
        strokeWidth={strokeWidth}
        {...FACE_STROKE}
      />
      <ellipse
        className='face-open'
        cx='50'
        cy={cy}
        rx={rx}
        ry={ry}
        fill='var(--pepper-pupil)'
      />
    </>
  );
}

const FACES: Record<PepperFaceLook, () => ReactNode> = {
  BRIGHT: () => (
    <>
      <Corn isBright />
      <circle cx='30' cy='63' r='4.6' fill='var(--pepper-cheek)' opacity='.4' />
      <circle cx='70' cy='63' r='4.6' fill='var(--pepper-cheek)' opacity='.4' />
      <g className='eyes'>
        <g className='blinker'>
          <circle
            className='pupil'
            cx='39'
            cy='52'
            r='5'
            fill='var(--pepper-pupil)'
          />
          <circle
            className='pupil'
            cx='61'
            cy='52'
            r='5'
            fill='var(--pepper-pupil)'
          />
          <circle cx='40.8' cy='50.2' r='1.6' fill='var(--pepper-eye)' />
          <circle cx='62.8' cy='50.2' r='1.6' fill='var(--pepper-eye)' />
        </g>
      </g>
      <Mouth
        smile='M44 64q6 5 12 0'
        strokeWidth='3'
        cy='66'
        rx='4.6'
        ry='3.8'
      />
    </>
  ),
  CALM: () => (
    <>
      <Corn />
      <g className='eyes'>
        <g className='blinker'>
          <ellipse
            cx='39'
            cy='49'
            rx='4.2'
            ry='3.4'
            fill='var(--pepper-pupil)'
          />
          <ellipse
            cx='61'
            cy='49'
            rx='4.2'
            ry='3.4'
            fill='var(--pepper-pupil)'
          />
        </g>
        <g className='lid'>
          <path
            d='M34 46.5q5-3.5 10 0M56 46.5q5-3.5 10 0'
            strokeWidth='2.2'
            {...FACE_STROKE}
          />
        </g>
      </g>
      <Mouth
        smile='M44 61q6 4.2 12 0'
        strokeWidth='2.6'
        cy='63'
        rx='4'
        ry='3.3'
      />
    </>
  ),
  WARM: () => (
    <>
      <Corn />
      <path
        className='arc'
        d='M34 50q5-5 10 0M56 50q5-5 10 0'
        strokeWidth='2.6'
        {...FACE_STROKE}
      />
      <g className='round'>
        <ellipse cx='39' cy='49' rx='3.8' ry='4' fill='var(--pepper-pupil)' />
        <ellipse cx='61' cy='49' rx='3.8' ry='4' fill='var(--pepper-pupil)' />
      </g>
      <Mouth
        smile='M41 61q9 8 18 0'
        strokeWidth='2.6'
        cy='64'
        rx='4.6'
        ry='3.6'
      />
    </>
  ),
  BROWS: () => (
    <>
      <Corn />
      <g className='brow brow-l'>
        <path d='M33 41q5-3 10-1' strokeWidth='2.4' {...FACE_STROKE} />
      </g>
      <g className='brow brow-r'>
        <path d='M57 40q5-2 10 1' strokeWidth='2.4' {...FACE_STROKE} />
      </g>
      <g className='eyes'>
        <g className='blinker'>
          <circle cx='38.5' cy='49' r='3.6' fill='var(--pepper-pupil)' />
          <circle cx='61.5' cy='49' r='3.6' fill='var(--pepper-pupil)' />
        </g>
      </g>
      <Mouth
        smile='M44 61q6 4.2 12 0'
        strokeWidth='2.6'
        cy='63'
        rx='4'
        ry='3.3'
      />
    </>
  ),
  LINE: () => (
    <>
      <circle cx='50' cy='54' r='34' fill='var(--pepper-warm)' />
      <ellipse
        cx='37'
        cy='38'
        rx='9'
        ry='5'
        fill='var(--pepper-warm-hi)'
        opacity='.6'
        transform='rotate(-32 37 38)'
      />
      <g className='eyes'>
        <g className='blinker'>
          <rect
            className='eye'
            x='37'
            y='43'
            width='4.4'
            height='11'
            rx='2.2'
            fill='var(--pepper-pupil)'
          />
          <rect
            className='eye'
            x='58.6'
            y='43'
            width='4.4'
            height='11'
            rx='2.2'
            fill='var(--pepper-pupil)'
          />
        </g>
      </g>
      <Mouth
        smile='M43 62q7 5 14 0'
        strokeWidth='2.8'
        cy='64'
        rx='4'
        ry='3.3'
      />
    </>
  ),
  GLANCE: () => (
    <>
      <Corn />
      <g className='eyes'>
        <g className='blinker'>
          <circle cx='39' cy='50' r='3.8' fill='var(--pepper-pupil)' />
          <circle cx='61' cy='50' r='3.8' fill='var(--pepper-pupil)' />
        </g>
      </g>
      <g className='lid'>
        <path
          d='M33.5 47.5h11M55.5 47.5h11'
          stroke='var(--pepper-warm)'
          strokeWidth='4'
          fill='none'
          strokeLinecap='round'
        />
        <path d='M34 46h10M56 46h10' strokeWidth='2.2' {...FACE_STROKE} />
      </g>
      <Mouth
        smile='M44 62q8 4 13-2'
        strokeWidth='2.6'
        cy='64'
        rx='4'
        ry='3.3'
      />
    </>
  ),
};

/** Pepper's face for the orb's disc, one drawing per look, coloured and moved by the app's stylesheet from the orb's state. */
function PepperFace({ look }: PepperFaceProps) {
  return (
    <span
      aria-hidden='true'
      className={join('pepper-face', `pepper-${look.toLowerCase()}`)}
    >
      <svg viewBox='0 0 100 100' aria-hidden='true' focusable='false'>
        <g className='whole'>{FACES[look]()}</g>
      </svg>
    </span>
  );
}

export default PepperFace;
