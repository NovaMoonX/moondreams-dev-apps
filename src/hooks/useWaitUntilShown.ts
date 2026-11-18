import { useCallback, useEffect, useRef } from 'react';

import { waitUntil, type WaitUntilOptions } from '@/utils/waitUntil';

/** Waits until the latest rendered `value` passes a check, so a working state lasts until a listener shows a callable's change rather than only until the call answers. */
export function useWaitUntilShown<T>(value: T) {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  return useCallback(
    (isShown: (current: T) => boolean, options?: WaitUntilOptions) =>
      waitUntil(() => isShown(latest.current), options),
    [],
  );
}
