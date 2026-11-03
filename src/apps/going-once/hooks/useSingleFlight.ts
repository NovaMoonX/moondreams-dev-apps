import { useRef, useState } from 'react';

/** Runs one async act at a time: `run` answers `null` without starting when one is already running, and `isWorking` is for disabling the buttons that start one. */
export function useSingleFlight() {
  const [isWorking, setIsWorking] = useState(false);
  const isInFlightRef = useRef(false);

  const run = async <T>(act: () => Promise<T>): Promise<T | null> => {
    if (isInFlightRef.current) return null;
    isInFlightRef.current = true;
    setIsWorking(true);
    try {
      return await act();
    } finally {
      isInFlightRef.current = false;
      setIsWorking(false);
    }
  };

  return { isWorking, run };
}
