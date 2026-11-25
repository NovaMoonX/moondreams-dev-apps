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
  /** The round mark in the disc; a plain accent-coloured orb when omitted. */
  avatar?: ReactNode;
  /** The live input level while listening and the output level while speaking, 0 to 1, read every frame. */
  getLevel?: () => number;
  /** `lg` is the bigger disc and word for a laptop. */
  size?: 'md' | 'lg';
  /** When given the whole pill is one button. */
  onClick?: () => void;
  className?: string;
}

/** The floating pill that shows where a spoken assistant is (waiting, listening, thinking, speaking); the accent is `--assistant-orb-accent`. */
function AssistantOrb({
  state,
  word,
  avatar,
  getLevel,
  size = 'md',
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
      className={join('assistant-orb', !onClick && className)}
    >
      <span aria-hidden='true' className='assistant-orb-disc'>
        <span className='assistant-orb-avatar'>
          {avatar ?? <span className='assistant-orb-default' />}
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
        buttonProps={{ 'aria-label': word }}
      >
        {pill}
      </Clickable>
      {status}
    </>
  );
}

export default AssistantOrb;
