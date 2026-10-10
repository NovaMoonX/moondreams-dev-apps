import { useSyncExternalStore } from 'react';

import { getIsUpdateReady, subscribeToUpdateReady } from '@lib/app/appUpdate';

/** True once a newer version of the app has downloaded and a restart will load it. */
export function useUpdateReady() {
  const isUpdateReady = useSyncExternalStore(subscribeToUpdateReady, getIsUpdateReady);
  return isUpdateReady;
}
