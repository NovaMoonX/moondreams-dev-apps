import { useQueryClient } from '@tanstack/react-query';

import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import { getTurnOnFailureText } from '@/lib/notifications/deviceText';
import { notificationsQueryKeys } from '@/lib/notifications/notificationsQueries';
import { NOTIFY_WORDS } from '@apps/runway/constants';

/** Asks this device for notifications; resolves to null once on, or the line to show when not. */
export function useTurnOnDevice(uid: string | null) {
  const queryClient = useQueryClient();
  return async () => {
    if (!uid) return null;
    const result = await turnOnDevicePush(uid);
    await queryClient.invalidateQueries({
      queryKey: notificationsQueryKeys.device(uid),
    });
    if (result === 'on') return null;
    return result === 'dismissed'
      ? NOTIFY_WORDS.dismissed
      : getTurnOnFailureText(result);
  };
}
