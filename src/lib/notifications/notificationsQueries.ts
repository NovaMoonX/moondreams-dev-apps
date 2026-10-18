import { queryOptions } from '@tanstack/react-query';

import { readDevicePushState } from './devicePush';

export const notificationsQueryKeys = {
  all: ['notifications'] as const,
  device: (uid: string) =>
    [...notificationsQueryKeys.all, 'device', uid] as const,
};

/** This device's push state: read from the browser, never from Firestore, so a permission changed in the browser's settings shows up when the person comes back. */
export function devicePushQueryOptions(uid: string) {
  return queryOptions({
    queryKey: notificationsQueryKeys.device(uid),
    queryFn: () => readDevicePushState(uid),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
