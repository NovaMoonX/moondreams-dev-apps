import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { Clickable } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export type AssistantOrbState =
  'off' | 'waiting' | 'listening' | 'thinking' | 'speaking';

interface AssistantOrbProps {
  state: AssistantOrbState;
  /** The short line for the current state; the caller writes the copy for each. */
  word: string;
  /** The round mark in the disc, which then does the expressing and gets a larger disc; a lit drop of the accent when omitted. */
  avatar?: ReactNode;
  /** The live input level while listening and the output level while speaking, 0 to 1, read every frame. */
  getLevel?: () => number;
  /** `sm` is a 24px pill for a line of text, `lg` the bigger disc and word for a laptop. */
  size?: 'sm' | 'md' | 'lg';
  /** The assistant's name, for the button's label ("Pepper is listening."). */
  name?: string;
  /** What a tap does, in a sentence ("Tap to stop listening."); with `name` it completes the button's label. */
  actionHint?: string;
  /** When given the whole pill is one button. */
  onClick?: () => void;
  className?: string;
}

/** The plain orb's drawing: a halo, the accent body, a lighter core and a small sheen, moved by CSS on the nearest `data-state`; the pill uses it when it has no avatar, and a picker can draw it alone. */
export function AssistantOrbDrop() {
  return (
    <svg viewBox='6 6 88 88' focusable='false' className='assistant-orb-drop'>
      <g className='whole'>
        <circle className='halo' cx='50' cy='50' r='44' />
        <circle className='body' cx='50' cy='50' r='38' />
        <circle className='core' cx='50' cy='52' r='24' />
        <ellipse className='sheen' cx='39' cy='33' rx='8' ry='4.5' />
        <circle className='sweep' cx='50' cy='50' r='31' />
      </g>
    </svg>
  );
}

/** The floating pill that shows where a spoken assistant is (waiting, listening, thinking, speaking); the accent is `--assistant-orb-accent`. */
function AssistantOrb({
  state,
  word,
  avatar,
  getLevel,
  size = 'md',
  name,
  actionHint,
  onClick,
  className,
}: AssistantOrbProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const getLevelRef = useRef(getLevel);

  useEffect(() => {
    getLevelRef.current = getLevel;
  });

  const isLive = state === 'listening' || state === 'speaking';

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isLive) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const tick = () => {
      const level = Math.min(1, Math.max(0, getLevelRef.current?.() ?? 0));
      root.style.setProperty('--assistant-orb-level', level.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      root.style.removeProperty('--assistant-orb-level');
    };
  }, [isLive]);

  if (state === 'off') return null;

  const pill = (
    <div
      ref={rootRef}
      data-state={state}
      data-size={size}
      data-avatar={avatar ? 'true' : undefined}
      className={join('assistant-orb', !onClick && className)}
    >
      <span aria-hidden='true' className='assistant-orb-disc'>
        <span className='assistant-orb-avatar'>
          {avatar ?? <AssistantOrbDrop />}
        </span>
      </span>
      <span aria-hidden='true' className='assistant-orb-word'>
        {word}
      </span>
      <span aria-hidden='true' className='assistant-orb-wave'>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );

  // One live region outside any button, so a state change is announced once.
  const status = (
    <span role='status' aria-live='polite' className='sr-only'>
      {word}
    </span>
  );

  const label =
    name && actionHint ? `${name} is ${state}. ${actionHint}` : word;

  if (!onClick) {
    return (
      <>
        {pill}
        {status}
      </>
    );
  }

  return (
    <>
      <Clickable
        className={join('w-fit rounded-full', className)}
        onButtonClick={onClick}
        buttonProps={{
          'aria-label': label,
          className: size === 'sm' ? '-inset-y-2!' : undefined,
        }}
      >
        {pill}
      </Clickable>
      {status}
    </>
  );
}

export default AssistantOrb;
