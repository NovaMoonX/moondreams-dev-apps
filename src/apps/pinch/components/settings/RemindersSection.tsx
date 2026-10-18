import { useState } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppToggle from '@/components/AppToggle';
import { PillGroup } from '@/components/PillGroup';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { useNow } from '@/hooks/useNow';
import {
  turnOffDevicePush,
  turnOnDevicePush,
} from '@/lib/notifications/devicePush';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { LEAD_DAYS_CHOICES, REMINDER_KINDS } from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import type { PinchSettings, ReminderKind } from '@apps/pinch/types';
import {
  formatReminderHour,
  getDeviceReminderText,
  getDeviceTimeZone,
  getTurnOnFailureText,
  getZoneAbbreviation,
} from '@apps/pinch/utils/settings';

const HOUR_MS = 60 * 60_000;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  text: formatReminderHour(hour),
  value: String(hour),
}));
const LEAD_OPTIONS = LEAD_DAYS_CHOICES.map((days) => ({
  value: String(days),
  label: `${days} ${days === 1 ? 'day' : 'days'}`,
}));

interface EatSoonOptionsProps {
  uid: string;
  reminders: PinchSettings['reminders'];
}

/** How far ahead the morning note looks and when it comes, shown only while it is on. */
function EatSoonOptions({ uid, reminders }: EatSoonOptionsProps) {
  const { save } = usePinchSettings(uid);
  const zone = reminders.timeZone ?? getDeviceTimeZone();
  const now = useNow(HOUR_MS);
  const zoneName = getZoneAbbreviation(zone, now);

  return (
    <>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-xs'>
          Include what is due within
        </p>
        <PillGroup
          label='How many days ahead to look'
          options={LEAD_OPTIONS}
          value={String(reminders.leadDays)}
          onChange={(days) =>
            void save({ reminders: { leadDays: Number(days) } })
          }
        />
      </div>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-xs'>Send it at</p>
        <Select
          className='sm:max-w-60'
          options={HOUR_OPTIONS}
          value={String(reminders.hour)}
          onChange={(hour) =>
            void save({
              reminders: { hour: Number(hour), timeZone: getDeviceTimeZone() },
            })
          }
        />
        {zoneName !== '' && (
          <p className='text-muted-foreground text-xs'>
            Your time zone: {zoneName}
          </p>
        )}
      </div>
    </>
  );
}

interface RemindersSectionProps {
  uid: string;
}

/** Reminders on this device, then one switch per kind of reminder. The kinds only matter once this device can receive them, so they wait (dimmed, with their stored choice) until it is on. */
function RemindersSection({ uid }: RemindersSectionProps) {
  const queryClient = useQueryClient();
  const { settings, save } = usePinchSettings(uid);
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const [isAsking, setIsAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isOn = device === 'on';
  const canToggle = !isAsking && (device === 'off' || device === 'on');

  const handleDeviceChange = async (turnOn: boolean) => {
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

  const handleKindChange = (kind: ReminderKind, isChecked: boolean) =>
    save({
      reminders: {
        [kind]: isChecked,
        ...(kind === 'eatSoon' && isChecked
          ? { timeZone: getDeviceTimeZone() }
          : {}),
      },
    });

  return (
    <SettingsGroup
      title='Reminders'
      footer={
        device === 'off' && (
          <p>Turn on reminders for this device to choose what you get.</p>
        )
      }
    >
      <SettingsRow
        icon='🔔'
        title='Reminders on this device'
        description={
          <>
            {getDeviceReminderText(device)}
            {failure && (
              <span className='text-destructive mt-1 block'>{failure}</span>
            )}
          </>
        }
        control={
          <AppToggle
            aria-label='Reminders on this device'
            checked={isOn}
            disabled={!canToggle}
            onCheckedChange={(isChecked) => void handleDeviceChange(isChecked)}
          />
        }
      />
      {REMINDER_KINDS.map((kind) => (
        <SettingsRow
          key={kind.key}
          icon={kind.emoji}
          title={kind.title}
          description={kind.description}
          isDimmed={!isOn}
          control={
            <AppToggle
              aria-label={kind.title}
              checked={settings.reminders[kind.key]}
              disabled={!isOn}
              onCheckedChange={(isChecked) =>
                void handleKindChange(kind.key, isChecked)
              }
            />
          }
        >
          {kind.key === 'eatSoon' && settings.reminders.eatSoon && isOn && (
            <EatSoonOptions uid={uid} reminders={settings.reminders} />
          )}
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}

export default RemindersSection;
