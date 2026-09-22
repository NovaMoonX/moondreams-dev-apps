import { useEffect, useState } from 'react';

const DEFAULT_TICK_MS = 15_000;

/** Current timestamp, refreshed on an interval so time-driven UI (active/upcoming status, countdowns) updates without a page refresh. */
export function useNow(tickMs = DEFAULT_TICK_MS) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(intervalId);
  }, [tickMs]);

  return now;
}

export default useNow;
