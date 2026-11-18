import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import { selectEveryCapture } from '@apps/helm/store/selectors/captureSelectors';

/** Every loaded turn by id, an outside assistant's included. */
export function useCaptureById() {
  const captures = useAppSelector(selectEveryCapture);
  return useMemo(
    () => new Map(captures.map((capture) => [capture.id, capture])),
    [captures],
  );
}
