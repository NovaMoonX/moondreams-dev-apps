import { useState } from 'react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppToggle from '@/components/AppToggle';
import { PillGroup } from '@/components/PillGroup';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import SummaryEditor from '@/components/SummaryEditor';
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

const isNoteOn = (reminders: PinchSettings['reminders']) =>
  reminders.eatSoon || reminders.expiring;

const getLookAheadSummary = (reminders: PinchSettings['reminders']) => {
  const daysAhead = `${reminders.leadDays} ${reminders.leadDays === 1 ? 'day' : 'days'} ahead`;
  return isNoteOn(reminders)
    ? `${daysAhead} · note at ${formatReminderHour(reminders.hour)}`
    : daysAhead;
};

interface LookAheadEditorProps {
  uid: string;
  reminders: PinchSettings['reminders'];
  isNoteOn: boolean;
}

/** How far ahead "due soon" looks, which the pantry's own screens use too, and (while a morning note is on) when the note comes. */
function LookAheadEditor({ uid, reminders, isNoteOn }: LookAheadEditorProps) {
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
      {isNoteOn && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>Send the note at</p>
          <Select
            className='sm:max-w-60'
            options={HOUR_OPTIONS}
            value={String(reminders.hour)}
            onChange={(hour) =>
              void save({
                reminders: {
                  hour: Number(hour),
                  timeZone: getDeviceTimeZone(),
                },
              })
            }
          />
          {zoneName !== '' && (
            <p className='text-muted-foreground text-xs'>
              Your time zone: {zoneName}
            </p>
          )}
        </div>
      )}
    </>
  );
}

interface RemindersSectionProps {
  uid: string;
}

type AskKey = ReminderKind | 'device';

/** What to say under the row after a refused ask. A blocked or unsupported browser says so once under the group, so its rows add nothing. */
const getAskFailureText = (result: TurnOnResult, key: AskKey) => {
  if (result === 'blocked' || result === 'unsupported') return null;
  if (result === 'dismissed') {
    return `Nothing changed. Allow notifications when your browser asks, then ${key === 'device' ? 'tap Allow on this device' : 'switch this on'} again.`;
  }
  return getTurnOnFailureText(result);
};

/** One switch per reminder this app sends. Switching one on asks the browser for notifications on that tap when this device isn't set up, and a refusal leaves the switch off and says why: under the row, or once under the group when the browser blocks notifications or can't show them (its switches are then off and disabled). A reminder that is on while this device is off says so under the group, with the same ask beside it. */
function RemindersSection({ uid }: RemindersSectionProps) {
  const queryClient = useQueryClient();
  const { settings, save } = usePinchSettings(uid);
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const [askingKey, setAskingKey] = useState<AskKey | null>(null);
  const [failure, setFailure] = useState<{
    key: AskKey;
    text: string;
  } | null>(null);
  const stuckState =
    device === 'blocked' || device === 'unsupported' ? device : null;
  const isOffWithReminders =
    device === 'off' &&
    REMINDER_KINDS.some((kind) => settings.reminders[kind.key]);

  const askDevice = async (key: AskKey) => {
    setAskingKey(key);
    try {
      const result = await turnOnDevicePush(uid);
      if (result !== 'on') {
        const text = getAskFailureText(result, key);
        if (text !== null) setFailure({ key, text });
      }
      return result === 'on';
    } finally {
      setAskingKey(null);
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.device(uid),
      });
    }
  };

  const handleKindChange = async (kind: ReminderKind, isChecked: boolean) => {
    setFailure(null);
    if (isChecked && device !== 'on' && !(await askDevice(kind))) return;
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
      description={
        stuckState !== null && getDeviceNotificationsText(stuckState)
      }
      footer={
        isOffWithReminders && (
          <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
            <p className='min-w-0 flex-1 basis-48'>
              Notifications are off on this device, so these reminders won’t
              reach it.
            </p>
            <Button
              variant='secondary'
              rounded='full'
              disabled={askingKey !== null}
              onClick={() => {
                setFailure(null);
                void askDevice('device');
              }}
            >
              Allow on this device
            </Button>
            {failure?.key === 'device' && (
              <p className='text-destructive basis-full'>{failure.text}</p>
            )}
          </div>
        )
      }
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
                askingKey !== null ||
                (stuckState !== null && !settings.reminders[kind.key])
              }
              onCheckedChange={(isChecked) =>
                void handleKindChange(kind.key, isChecked)
              }
            />
          }
        />
      ))}
      <li className='-mx-3'>
        <SummaryEditor
          label='What counts as due soon'
          title='What counts as due soon'
          groupPosition='last'
          icon='📅'
          lines={2}
          summary={getLookAheadSummary(settings.reminders)}
          placeholder=''
          shouldFocus={false}
        >
          <LookAheadEditor
            uid={uid}
            reminders={settings.reminders}
            isNoteOn={isNoteOn(settings.reminders)}
          />
        </SummaryEditor>
      </li>
    </SettingsGroup>
  );
}

export default RemindersSection;
