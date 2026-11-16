import { dayKeyToMs } from '@/utils/cadenceUtils';
import {
  formatTimezoneAbbreviation,
  formatTimezoneLabel,
  getDeviceTimeZone,
} from '@/utils/timezoneUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  describeScheduledRule,
  readNextRuns,
  toDayKeyIn,
  type Occurrence,
} from '@apps/helm/engine/scheduledActions';
import { toActionState } from '@apps/helm/store/actions/scheduledActionWrites';
import type {
  OpenScheduledAction,
  ScheduledFailReason,
} from '@apps/helm/types';

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const shortDayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

/** "Sun, Nov 29" from a day key. */
export const formatRunDay = (dayKey: string) =>
  dayFormat.format(dayKeyToMs(dayKey));

/** "Nov 29" from a day key. */
export const formatShortDay = (dayKey: string) =>
  shortDayFormat.format(dayKeyToMs(dayKey));

/** "6:00 PM" from a floating "HH:mm". */
export const formatClockWords = (time: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(Date.parse(`1970-01-01T${time}:00Z`));

/** The zone's short name after a time, only when this phone's zone is not the action's. */
export const readZoneSuffix = (zone: string, at: number) => {
  const device = getDeviceTimeZone();
  return device === null || device === zone
    ? ''
    : ` ${formatTimezoneAbbreviation(zone, at)}`;
};

/** The zone's own name ("Pacific Time"), with no city. */
export const readZoneName = (zone: string) =>
  formatTimezoneLabel(zone).split(' · ').at(-1) ?? zone;

/** "Sun, Nov 29 · 6:00 PM" for one run. */
export const formatRun = (
  run: Pick<Occurrence, 'day' | 'time' | 'at'>,
  zone: string,
) =>
  `${formatRunDay(run.day)} · ${formatClockWords(run.time)}${readZoneSuffix(zone, run.at)}`;

/** The same for an instant in the action's zone, such as when a run was due. */
export const formatInstant = (at: number, zone: string) =>
  `${formatRunDay(toDayKeyIn(at, zone))} · ${new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at))}${readZoneSuffix(zone, at)}`;

export const readActionZone = (action: OpenScheduledAction, homeZone: string) =>
  action.timeZone ?? homeZone;

/** The rule in the one words line every surface shows, and the next runs. */
export const readRuleWords = (
  action: OpenScheduledAction,
  homeZone: string,
  now: number,
) => describeScheduledRule(toActionState(action), homeZone, now);

export const readNextOf = (
  action: OpenScheduledAction,
  homeZone: string,
  now: number,
) => readNextRuns(toActionState(action), homeZone, now);

/** Whether a pause by days is on: the action is active but its runs wait until a day. */
export const isPausedByDays = (
  action: OpenScheduledAction,
  now: number,
  zone: string,
) =>
  action.status === 'active' &&
  action.pausedUntil !== null &&
  action.pausedUntil >= dayKeyToMs(toDayKeyIn(now, zone));

export const isPausedNow = (
  action: OpenScheduledAction,
  now: number,
  zone: string,
) => action.status === 'paused' || isPausedByDays(action, now, zone);

const REASON_WORDS: Record<ScheduledFailReason, string> = {
  notConnected: HELM_COPY.scheduledWhyNotConnected,
  grantExpired: HELM_COPY.scheduledWhyExpired,
  notAllowed: HELM_COPY.scheduledWhyNotAllowed,
  runFailed: HELM_COPY.scheduledWhyFailed,
  ruleInvalid: HELM_COPY.scheduledWhyRule,
};

/** The one meta line under an action's name in the list. */
export function readListMeta(
  action: OpenScheduledAction,
  homeZone: string,
  now: number,
): string {
  const zone = readActionZone(action, homeZone);
  if (action.status === 'ended') {
    return HELM_COPY.scheduledEndedOn(
      formatRunDay(toDayKeyIn(action.lastEditedAt ?? action.createdAt, zone)),
    );
  }
  if (action.lastOutcome === 'failed' && action.lastRunDueAt !== null) {
    return HELM_COPY.scheduledDidntRun(
      formatRun(
        {
          day: toDayKeyIn(action.lastRunDueAt, zone),
          time: new Intl.DateTimeFormat('en-GB', {
            timeZone: zone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(action.lastRunDueAt)),
          at: action.lastRunDueAt,
        },
        zone,
      ),
      action.lastFailReason ? REASON_WORDS[action.lastFailReason] : null,
    );
  }
  if (action.status === 'paused') return HELM_COPY.scheduledPausedOpen;
  if (isPausedByDays(action, now, zone) && action.pausedUntil !== null) {
    return HELM_COPY.scheduledPausedUntil(
      formatShortDay(toDayKeyIn(action.pausedUntil, 'UTC')),
    );
  }
  const [next] = readNextOf(action, homeZone, now);
  return next
    ? HELM_COPY.scheduledNext(formatRun(next, zone))
    : HELM_COPY.scheduledNoMoreRuns;
}
