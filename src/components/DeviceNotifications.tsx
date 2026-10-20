import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppToggle from '@/components/AppToggle';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import {
  turnOffDevicePush,
  turnOnDevicePush,
} from '@/lib/notifications/devicePush';
import {
  getDeviceNotificationsText,
  getTurnOnFailureText,
} from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';

interface DeviceNotificationsProps {
  uid: string;
}

/** Whether this browser gets notifications from any of the site's apps. It is the site's switch, so it lives with the account, never inside one app; an app asks for it only on the tap that switches one of its own reminders on. */
function DeviceNotifications({ uid }: DeviceNotificationsProps) {
  const queryClient = useQueryClient();
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const [isAsking, setIsAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isOn = device === 'on';
  const canToggle = !isAsking && (device === 'off' || device === 'on');

  const handleChange = async (turnOn: boolean) => {
    setFailure(null);
    setIsAsking(true);
    try {
      if (turnOn) {
        setFailure(getTurnOnFailureText(await turnOnDevicePush(uid)));
      } else {
        await turnOffDevicePush(uid);
      }
    } finally {
      setIsAsking(false);
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.device(uid),
      });
    }
  };

  return (
    <SettingsGroup title='Notifications'>
      <SettingsRow
        icon='🔔'
        title='Notifications on this device'
        description={
          <>
            {getDeviceNotificationsText(device)}
            {failure && (
              <span className='text-destructive mt-1 block'>{failure}</span>
            )}
          </>
        }
        control={
          <AppToggle
            aria-label='Notifications on this device'
            checked={isOn}
            disabled={!canToggle}
            onCheckedChange={(isChecked) => void handleChange(isChecked)}
          />
        }
      />
    </SettingsGroup>
  );
}

export default DeviceNotifications;
