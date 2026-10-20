import { registerDeviceToken } from './registerDeviceToken';
import { requestPushPermission } from './requestPushPermission';

export async function enablePushNotifications(uid: string): Promise<void> {
  try {
    const token = await requestPushPermission();

    if (token) {
      await registerDeviceToken(uid, token);
    }
  } catch {
    // Push notifications are a stretch feature — a failure here shouldn't affect anything else.
  }
}
