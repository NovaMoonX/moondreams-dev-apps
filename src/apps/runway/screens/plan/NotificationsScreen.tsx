import { useState } from 'react';

import { Bell, Smartphone } from 'lucide-react';
import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import ActionRow from '@/components/ActionRow';
import AppToggle from '@/components/AppToggle';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import {
  getDeviceNotificationsText,
  getTurnOnFailureText,
} from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  DEFAULT_NOTIFY_HOUR,
  NOTIFY_FIRST_HOUR,
  NOTIFY_LAST_HOUR,
  NOTIFY_WORDS,
} from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { setNotify } from '@apps/runway/store/actions/planActions';
import {
  formatNotifyHour,
  getDeviceTimeZone,
  getZoneAbbreviation,
} from '@apps/runway/utils/notifyTime';

const HOUR_MS = 60 * 60_000;
const HOUR_OPTIONS = Array.from(
  { length: NOTIFY_LAST_HOUR - NOTIFY_FIRST_HOUR + 1 },
  (_, index) => ({
    text: formatNotifyHour(NOTIFY_FIRST_HOUR + index),
    value: String(NOTIFY_FIRST_HOUR + index),
  }),
);

interface NotificationsScreenProps {
  onClose: () => void;
}

/** The once-a-day "Purchases waiting for a home" push: its switch, and the hour it comes. Turning it on asks this device for notifications on that tap. */
function NotificationsScreen({ onClose }: NotificationsScreenProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const plan = useAppSelector((state) => state.runway.plan);
  const uid = user?.uid ?? null;
  const device = useQuery({
    ...devicePushQueryOptions(uid ?? ''),
    enabled: uid !== null,
  }).data;
  const now = useNow(HOUR_MS);
  const [isSwitching, setIsSwitching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isOn = plan?.notify?.needsHome ?? false;
  const hour = plan?.notifyHour ?? DEFAULT_NOTIFY_HOUR;
  const deviceZone = getDeviceTimeZone();
  const zone = plan?.notifyTimeZone ?? deviceZone;
  const zoneName = getZoneAbbreviation(zone, now);
  const deviceZoneName = getZoneAbbreviation(deviceZone, now);
  const isZoneElsewhere =
    deviceZone !== null && zone !== deviceZone && deviceZoneName !== '';
  const stuckState =
    device === 'blocked' || device === 'unsupported' ? device : null;

  const save = async (patch: Parameters<typeof setNotify>[2]) => {
    if (!uid) return false;
    try {
      await setNotify(uid, await getRunwayEncryption(uid), patch);
      return true;
    } catch (error) {
      setMessage(getErrorMessage(error, NOTIFY_WORDS.saveFailed));
      return false;
    }
  };

  const askDevice = async () => {
    if (!uid) return false;
    const result = await turnOnDevicePush(uid);
    await queryClient.invalidateQueries({
      queryKey: notificationsQueryKeys.device(uid),
    });
    if (result === 'on') return true;
    if (result === 'dismissed') setMessage(NOTIFY_WORDS.dismissed);
    else setMessage(getTurnOnFailureText(result));
    return false;
  };

  const handleSwitch = async (isChecked: boolean) => {
    if (isSwitching) return;
    setIsSwitching(true);
    setMessage(null);
    if (isChecked && stuckState !== null) {
      setMessage(getDeviceNotificationsText(stuckState));
      return;
    }
    try {
      if (isChecked && device !== 'on' && !(await askDevice())) return;
      await save({
        needsHome: isChecked,
        ...(isChecked && plan?.notifyHour == null ? { hour } : {}),
        ...(isChecked && plan?.notifyTimeZone == null
          ? { timeZone: getDeviceTimeZone() }
          : {}),
      });
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Subview overlay title={NOTIFY_WORDS.rowLabel} onClose={onClose}>
      <div className='space-y-4'>
        <SettingsGroup
          title={NOTIFY_WORDS.group}
          description={
            stuckState !== null && getDeviceNotificationsText(stuckState)
          }
        >
          <SettingsRow
            icon={<Bell className='size-5' />}
            title={NOTIFY_WORDS.switchLabel}
            description={
              <>
                {NOTIFY_WORDS.switchHelp}
                {message && (
                  <span className='text-destructive mt-1 block' role='alert'>
                    {message}
                  </span>
                )}
              </>
            }
            control={
              <AppToggle
                aria-label={NOTIFY_WORDS.switchLabel}
                checked={isOn}
                disabled={isSwitching}
                onCheckedChange={(isChecked) => void handleSwitch(isChecked)}
              />
            }
          >
            {isOn && (
              <div className='space-y-2'>
                <p className='text-muted-foreground text-xs'>
                  {NOTIFY_WORDS.hourLabel}
                </p>
                <Select
                  className='sm:max-w-60'
                  options={HOUR_OPTIONS}
                  value={String(hour)}
                  onChange={(next) =>
                    void save({
                      hour: Number(next),
                      timeZone: getDeviceTimeZone(),
                    })
                  }
                />
                {isZoneElsewhere ? (
                  <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                    <p className='text-muted-foreground text-xs'>
                      {NOTIFY_WORDS.zoneSaved(zoneName || zone || '')}
                    </p>
                    <Button
                      variant='tertiary'
                      size='sm'
                      onClick={() => void save({ timeZone: deviceZone })}
                    >
                      {NOTIFY_WORDS.switchZone(deviceZoneName)}
                    </Button>
                  </div>
                ) : (
                  zoneName !== '' && (
                    <p className='text-muted-foreground text-xs'>
                      {NOTIFY_WORDS.zone(zoneName)}
                    </p>
                  )
                )}
              </div>
            )}
          </SettingsRow>
        </SettingsGroup>
        {isOn && device === 'off' && (
          <ActionRow
            icon={<Smartphone />}
            label={NOTIFY_WORDS.deviceOff}
            subtitle={NOTIFY_WORDS.deviceOffSub}
            onClick={() => {
              setMessage(null);
              void askDevice();
            }}
          />
        )}
      </div>
    </Subview>
  );
}

export default NotificationsScreen;
