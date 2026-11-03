import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import InlineNotice from '@/components/InlineNotice';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { useAppSelector } from '@/store';
import { setInquiryPush } from '@apps/going-once/store/actions/peopleActions';
import { selectIsInquiryPushOff } from '@apps/going-once/store/selectors';

const getHelperText = (isOff: boolean | null) => {
  if (isOff === null) return 'Checking your push setting…';
  return isOff
    ? "Off for you on this sale. You'll still see everything in the Inbox."
    : 'Just the thing, never who asked. Several close together come as one.';
};

const getDeviceNote = (device: 'blocked' | 'unsupported') =>
  device === 'blocked'
    ? "This device won't get them: allow notifications for this site in your browser's settings."
    : "This browser can't show notifications.";

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
    // The browser only shows its prompt for a call made in the tap itself, so it starts before the first await.
    const asking = isChecked && device === 'off' ? turnOnDevicePush(uid) : null;
    const [saved] = await Promise.allSettled([
      setInquiryPush(uid, saleId, isChecked),
      asking,
    ]);
    if (saved.status === 'rejected') {
      setError("We couldn't save that. Check your connection and try again.");
    }
    if (asking) {
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.device(uid),
      });
    }
  };

  const note =
    device === 'blocked' || device === 'unsupported'
      ? getDeviceNote(device)
      : null;

  return (
    <section
      aria-label='Notifications'
      className='border-border bg-card space-y-2 rounded-2xl border px-4 py-3'
    >
      <div className='flex min-h-10 items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <span className='bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full'>
            <BellRing className='size-[18px]' aria-hidden='true' />
          </span>
          <h3 className='min-w-0 font-medium text-pretty'>
            Push me when someone&apos;s interested
          </h3>
        </div>
        <AppToggle
          aria-label="Push me when someone's interested"
          checked={isOff === false}
          disabled={isOff === null}
          onCheckedChange={(isChecked) => void handleChange(isChecked)}
        />
      </div>
      <p className='text-muted-foreground text-sm text-pretty'>
        {getHelperText(isOff)}
      </p>
      {note && <InlineNotice tone='warning'>{note}</InlineNotice>}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </section>
  );
}

export default PushSwitch;
