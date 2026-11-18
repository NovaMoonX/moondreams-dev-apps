import { useEffect, useRef, useState } from 'react';

const DEFAULT_MINIMUM_MS = 700;

/** A working state held on screen for at least a moment once it starts, so a retry that fails at once never flashes its spinner. */
export function useSteadyBusy(isBusy: boolean, minimumMs = DEFAULT_MINIMUM_MS) {
  const [isHeld, setIsHeld] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (!isBusy) return;
    run.current += 1;
    const thisRun = run.current;
    // Neither timer is cleared when the work ends: the hold outlives it, even work that ends in the same tick.
    setTimeout(() => {
      if (run.current === thisRun) setIsHeld(true);
    }, 0);
    setTimeout(() => {
      if (run.current === thisRun) setIsHeld(false);
    }, minimumMs);
  }, [isBusy, minimumMs]);

  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  return isBusy || isHeld;
}
