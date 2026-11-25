import { useState } from 'react';

import { Smartphone } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import ActionRow from '@/components/ActionRow';
import InlineNotice from '@/components/InlineNotice';
import { useAuth } from '@/hooks/useAuth';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import {
  getDeviceNotificationsText,
  getTurnOnFailureText,
} from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { ALERT_WORDS, NOTIFY_WORDS } from '@apps/runway/constants';
import AlertsPanel from '@apps/runway/components/AlertsPanel';

interface FreeToSpendAlertsProps {
  /** True where the screen above already says this device can't get notifications. */
  isStuckShownAbove?: boolean;
  /** True where the screen above already offers to turn notifications on for this device. */
  isOffShownAbove?: boolean;
}

/** Free to Spend's alerts, with what this device needs to receive them. */
function FreeToSpendAlerts({
  isStuckShownAbove = false,
  isOffShownAbove = false,
}: FreeToSpendAlertsProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const queryClient = useQueryClient();
  const device = useQuery({
    ...devicePushQueryOptions(uid ?? ''),
    enabled: uid !== null,
  }).data;
  const [message, setMessage] = useState<string | null>(null);
  const stuckState =
    device === 'blocked' || device === 'unsupported' ? device : null;

  const askDevice = async () => {
    if (!uid) return;
    setMessage(null);
    const result = await turnOnDevicePush(uid);
    await queryClient.invalidateQueries({
      queryKey: notificationsQueryKeys.device(uid),
    });
    if (result === 'on') return;
    setMessage(
      result === 'dismissed'
        ? NOTIFY_WORDS.dismissed
        : getTurnOnFailureText(result),
    );
  };

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>{ALERT_WORDS.freeHelp}</p>
      {!isStuckShownAbove && stuckState !== null && (
        <InlineNotice tone='warning'>
          {getDeviceNotificationsText(stuckState)}
        </InlineNotice>
      )}
      {!isOffShownAbove && device === 'off' && (
        <ActionRow
          icon={<Smartphone />}
          label={ALERT_WORDS.turnOn}
          subtitle={ALERT_WORDS.turnOnSub}
          onClick={() => void askDevice()}
        />
      )}
      {message && (
        <p className='text-destructive text-sm' role='alert'>
          {message}
        </p>
      )}
      <AlertsPanel target={{ kind: 'freeToSpend' }} eachTimeCents={null} />
    </div>
  );
}

export default FreeToSpendAlerts;
