import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppToggle from '@/components/AppToggle';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import { getDeviceNotificationsText } from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { useAppSelector } from '@/store';
import { setInquiryPush } from '@apps/going-once/store/actions/peopleActions';
import { selectIsInquiryPushOff } from '@apps/going-once/store/selectors';

interface PushSwitchProps {
  saleId: string;
  uid: string;
}

/** The Sale tab's switch for this person's push when someone is interested; on until they turn it off, for this sale only. Turning it on asks the browser on that tap when this phone has not been asked. */
function PushSwitch({ saleId, uid }: PushSwitchProps) {
  const queryClient = useQueryClient();
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const isOff = useAppSelector((state) =>
    selectIsInquiryPushOff(state, saleId),
  );
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (isChecked: boolean) => {
    setError(null);
    try {
      await setInquiryPush(uid, saleId, isChecked);
    } catch {
      setError("We couldn't save that. Check your connection and try again.");
      return;
    }
    if (!isChecked || device !== 'off') return;
    await turnOnDevicePush(uid);
    await queryClient.invalidateQueries({
      queryKey: notificationsQueryKeys.device(uid),
    });
  };

  const note =
    device === 'blocked' || device === 'unsupported'
      ? getDeviceNotificationsText(device)
      : null;

  return (
    <section
      aria-label='Notifications'
      className='border-border bg-card space-y-1 rounded-2xl border p-4'
    >
      <div className='flex min-h-10 items-center justify-between gap-3'>
        <h3 className='min-w-0 font-medium text-pretty'>
          Push me when someone&apos;s interested
        </h3>
        <AppToggle
          aria-label="Push me when someone's interested"
          checked={isOff === false}
          disabled={isOff === null}
          onCheckedChange={(isChecked) => void handleChange(isChecked)}
        />
      </div>
      <p className='text-muted-foreground text-sm text-pretty'>
        {isOff === false
          ? 'Just the thing, never who asked. Several close together come as one.'
          : "Off for you on this sale. You'll still see everything in the Inbox."}
      </p>
      {isOff === false && note && (
        <p className='text-muted-foreground text-xs text-pretty'>{note}</p>
      )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </section>
  );
}

export default PushSwitch;
