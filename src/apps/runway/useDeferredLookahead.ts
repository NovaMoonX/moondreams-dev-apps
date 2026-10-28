import { useEffect, useState } from 'react';

import { useAppSelector } from '@/store';
import { selectLookahead } from '@apps/runway/store/selectors/lookaheadSelectors';

const painted = { isWarm: false };

/** The lookahead once the screen has painted with its figures: walking a year of income days is the slowest figure on Home and Days, and nothing else on them waits for it. */
export function useDeferredLookahead(today: number, isReady: boolean) {
  const [isPainted, setIsPainted] = useState(painted.isWarm);

  useEffect(() => {
    if (!isReady || painted.isWarm) return;
    const timer = { id: 0 };
    const frame = requestAnimationFrame(() => {
      timer.id = window.setTimeout(() => {
        painted.isWarm = true;
        setIsPainted(true);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer.id);
    };
  }, [isReady]);

  const result = useAppSelector((state) =>
    isReady && isPainted ? selectLookahead(state, today) : null,
  );
  return result;
}
