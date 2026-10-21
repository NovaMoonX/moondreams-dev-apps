import { isDevicePushOff } from './devicePush';
import { registerDeviceToken } from './registerDeviceToken';
import { requestPushPermission } from './requestPushPermission';

export async function enablePushNotifications(uid: string): Promise<void> {
  // A person who turned reminders off on this device stays off after a reload.
  if (isDevicePushOff(uid)) {
    return;
  }

  try {
    const token = await requestPushPermission();

    if (token) {
      await registerDeviceToken(uid, token);
    }
  } catch {
    // Push notifications are a stretch feature — a failure here shouldn't affect anything else.
  }
}
