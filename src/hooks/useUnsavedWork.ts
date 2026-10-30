import { useEffect, useRef } from 'react';

import { watchUnsavedWork } from '@lib/app/unsavedWork';

/** Tells a restart that this form holds work while `read` says so; for forms that track dirtiness themselves rather than through `useDiscardGuard`. */
export function useUnsavedWork(read: () => boolean) {
  const latest = useRef(read);

  useEffect(() => {
    latest.current = read;
  }, [read]);

  useEffect(() => watchUnsavedWork(() => latest.current()), []);
}
