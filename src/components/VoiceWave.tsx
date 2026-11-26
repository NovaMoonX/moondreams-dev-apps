import { useEffect, useRef } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

const BAR_COUNT = 28;
const SAMPLE_MS = 55;
const MIN_SCALE = 0.12;
const STILL_SCALE = 0.35;

interface VoiceWaveProps {
  /** The live input level, 0 to 1, read every frame; null when nothing reports one (the bars then stay calm and still). */
  getLevel: () => number | null;
  className?: string;
}

/** A classic audio wave of thin bars that scrolls left as the person speaks; the colour is `--voice-wave` (an app sets it), else the orb's accent, else the primary. Still under reduced motion and when no level is reported. */
function VoiceWave({ getLevel, className }: VoiceWaveProps) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const getLevelRef = useRef(getLevel);

  useEffect(() => {
    getLevelRef.current = getLevel;
  });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const history = Array.from({ length: BAR_COUNT }, () => 0);
    let frame = 0;
    let lastAt = 0;
    const tick = (now: number) => {
      if (now - lastAt >= SAMPLE_MS) {
        lastAt = now;
        const read = getLevelRef.current();
        history.push(Math.min(1, Math.max(0, read ?? STILL_SCALE)));
        history.shift();
        history.forEach((value, index) => {
          const bar = bars.current[index];
          if (bar) {
            bar.style.scale = `1 ${Math.max(MIN_SCALE, value).toFixed(3)}`;
          }
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      aria-hidden='true'
      className={join('flex h-8 min-w-0 items-center gap-[3px]', className)}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            bars.current[index] = element;
          }}
          className='h-full w-[3px] shrink-0 origin-center [scale:1_0.12] rounded-full bg-[var(--voice-wave,var(--assistant-orb-accent,var(--color-primary)))] motion-reduce:[scale:1_0.35] motion-reduce:opacity-60'
        />
      ))}
    </span>
  );
}

export default VoiceWave;
