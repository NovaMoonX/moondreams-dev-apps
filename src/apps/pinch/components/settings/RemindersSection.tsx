import { useState } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppToggle from '@/components/AppToggle';
import { PillGroup } from '@/components/PillGroup';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { useNow } from '@/hooks/useNow';
import {
  turnOnDevicePush,
  type TurnOnResult,
} from '@/lib/notifications/devicePush';
import {
  getDeviceNotificationsText,
  getTurnOnFailureText,
} from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { LEAD_DAYS_CHOICES, REMINDER_KINDS } from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import type { PinchSettings, ReminderKind } from '@apps/pinch/types';
import {
  formatReminderHour,
  getDeviceTimeZone,
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

/** The kinds that share the one morning note, and so its days ahead and its hour. */
const isDigestKind = (kind: ReminderKind) =>
  kind === 'eatSoon' || kind === 'expiring';

/** The options sit once, under the first of the note's kinds that is on. */
const getOptionsHost = (reminders: PinchSettings['reminders']) =>
  reminders.eatSoon ? 'eatSoon' : reminders.expiring ? 'expiring' : null;

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

/** What to say under the row after a refused ask. A blocked or unsupported browser says so once under the group, so its rows add nothing. */
const getAskFailureText = (result: TurnOnResult) => {
  if (result === 'blocked' || result === 'unsupported') return null;
  if (result === 'dismissed') {
    return 'Nothing changed. Allow notifications when your browser asks, then switch this on again.';
  }
  return getTurnOnFailureText(result);
};

/** One switch per reminder this app sends. Switching one on asks the browser for notifications on that tap when this device isn't set up (the device's own switch is the site's, in the profile), and a refusal leaves the switch off and says why: under the row, or once under the group when the browser blocks notifications or can't show them (its switches are then off and disabled). */
function RemindersSection({ uid }: RemindersSectionProps) {
  const queryClient = useQueryClient();
  const { settings, save } = usePinchSettings(uid);
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const [askingKey, setAskingKey] = useState<ReminderKind | null>(null);
  const [failure, setFailure] = useState<{
    key: ReminderKind;
    text: string;
  } | null>(null);
  const isStuck = device === 'blocked' || device === 'unsupported';

  const handleKindChange = async (kind: ReminderKind, isChecked: boolean) => {
    setFailure(null);
    if (isChecked && device !== 'on') {
      setAskingKey(kind);
      try {
        const result = await turnOnDevicePush(uid);
        if (result !== 'on') {
          const text = getAskFailureText(result);
          if (text !== null) setFailure({ key: kind, text });
          return;
        }
      } finally {
        setAskingKey(null);
        await queryClient.invalidateQueries({
          queryKey: notificationsQueryKeys.device(uid),
        });
      }
    }
    await save({
      reminders: {
        [kind]: isChecked,
        ...(isDigestKind(kind) && isChecked
          ? { timeZone: getDeviceTimeZone() }
          : {}),
      },
    });
  };

  return (
    <SettingsGroup
      title='Reminders'
      footer={isStuck && <p>{getDeviceNotificationsText(device)}</p>}
    >
      {REMINDER_KINDS.map((kind) => (
        <SettingsRow
          key={kind.key}
          icon={kind.emoji}
          title={kind.title}
          description={
            <>
              {kind.description}
              {failure?.key === kind.key && (
                <span className='text-destructive mt-1 block'>
                  {failure.text}
                </span>
              )}
            </>
          }
          control={
            <AppToggle
              aria-label={kind.title}
              checked={settings.reminders[kind.key]}
              disabled={
                askingKey !== null || (isStuck && !settings.reminders[kind.key])
              }
              onCheckedChange={(isChecked) =>
                void handleKindChange(kind.key, isChecked)
              }
            />
          }
        >
          {getOptionsHost(settings.reminders) === kind.key && (
            <EatSoonOptions uid={uid} reminders={settings.reminders} />
          )}
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}

export default RemindersSection;
