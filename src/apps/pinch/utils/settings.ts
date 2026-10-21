import type { DevicePushState } from '@/lib/notifications/devicePush';
import {
  CONTAINER_FREEZER_DAYS,
  CONTAINER_FRIDGE_DAYS,
  DEFAULT_LEAD_DAYS,
  DEFAULT_REMINDER_HOUR,
  FREEZER_DAYS_RANGE,
  FRIDGE_DAYS_RANGE,
  FRIDGE_GUIDANCE_DAYS,
  LEAD_DAYS_CHOICES,
} from '@apps/pinch/constants';
import type { PinchReminderSettings, PinchSettings } from '@apps/pinch/types';

export interface UsualDays {
  fridge: number;
  freezer: number;
}

/** What a person with no settings document gets: every reminder off, the built-in days. */
export const DEFAULT_PINCH_SETTINGS: PinchSettings = {
  fridgeDays: null,
  freezerDays: null,
  suggestPhotos: true,
  reminders: {
    eatSoon: false,
    expiring: false,
    timers: false,
    leadDays: DEFAULT_LEAD_DAYS,
    hour: DEFAULT_REMINDER_HOUR,
    timeZone: null,
  },
  updatedAt: 0,
  lastDigestDay: null,
};

/** A stored document with any key it predates filled from the defaults, or the defaults themselves when there is none. */
export const getSettingsWithDefaults = (
  document: PinchSettings | null,
): PinchSettings =>
  document === null
    ? DEFAULT_PINCH_SETTINGS
    : {
        ...DEFAULT_PINCH_SETTINGS,
        ...document,
        reminders: {
          ...DEFAULT_PINCH_SETTINGS.reminders,
          ...document.reminders,
        },
      };

export const BUILT_IN_USUAL_DAYS: UsualDays = {
  fridge: CONTAINER_FRIDGE_DAYS,
  freezer: CONTAINER_FREEZER_DAYS,
};

/** The days a new box starts with: the person's own number, else the built-in one. */
export const getUsualDays = (
  settings: Pick<PinchSettings, 'fridgeDays' | 'freezerDays'> | null,
): UsualDays => ({
  fridge: settings?.fridgeDays ?? BUILT_IN_USUAL_DAYS.fridge,
  freezer: settings?.freezerDays ?? BUILT_IN_USUAL_DAYS.freezer,
});

const isWholeIn = (value: number, range: { min: number; max: number }) =>
  Number.isInteger(value) && value >= range.min && value <= range.max;

export const isValidFridgeDays = (days: number) =>
  isWholeIn(days, FRIDGE_DAYS_RANGE);

export const isValidFreezerDays = (days: number) =>
  isWholeIn(days, FREEZER_DAYS_RANGE);

export const isValidLeadDays = (days: number) =>
  LEAD_DAYS_CHOICES.includes(days);

export const isValidReminderHour = (hour: number) =>
  isWholeIn(hour, { min: 0, max: 23 });

/** The fields a change can touch; whatever is left out stays as it was. */
export interface PinchSettingsPatch {
  fridgeDays?: number;
  freezerDays?: number;
  suggestPhotos?: boolean;
  reminders?: Partial<PinchReminderSettings>;
}

/** The whole document for a person's first change: the defaults with their change on top. */
export const createSettings = (
  patch: PinchSettingsPatch,
  now: number,
): PinchSettings => ({
  ...DEFAULT_PINCH_SETTINGS,
  fridgeDays: patch.fridgeDays ?? DEFAULT_PINCH_SETTINGS.fridgeDays,
  freezerDays: patch.freezerDays ?? DEFAULT_PINCH_SETTINGS.freezerDays,
  suggestPhotos: patch.suggestPhotos ?? DEFAULT_PINCH_SETTINGS.suggestPhotos,
  reminders: { ...DEFAULT_PINCH_SETTINGS.reminders, ...patch.reminders },
  updatedAt: now,
});

/** One dotted path and value per field the change touches, so a write from another device to a field it didn't touch survives. */
export const getSettingsUpdates = (
  patch: PinchSettingsPatch,
  now: number,
): { path: string[]; value: unknown }[] => [
  ...(patch.fridgeDays === undefined
    ? []
    : [{ path: ['fridgeDays'], value: patch.fridgeDays }]),
  ...(patch.freezerDays === undefined
    ? []
    : [{ path: ['freezerDays'], value: patch.freezerDays }]),
  ...(patch.suggestPhotos === undefined
    ? []
    : [{ path: ['suggestPhotos'], value: patch.suggestPhotos }]),
  ...Object.entries(patch.reminders ?? {}).flatMap(([key, value]) =>
    value === undefined ? [] : [{ path: ['reminders', key], value }],
  ),
  { path: ['updatedAt'], value: now },
];

/** "9:00 am", "12:00 pm", "12:00 am". */
export const formatReminderHour = (hour: number) => {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
};

export const getDeviceTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** The short name of a zone as it is at `at` ("PDT"), or an empty string when the zone is unknown. */
export const getZoneAbbreviation = (timeZone: string | null, at: number) => {
  if (timeZone === null) return '';
  try {
    const formatter =
      zoneFormatters.get(timeZone) ??
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
    zoneFormatters.set(timeZone, formatter);
    return (
      formatter.formatToParts(at).find((part) => part.type === 'timeZoneName')
        ?.value ?? ''
    );
  } catch {
    return '';
  }
};

/** The line under "Reminders on this device": the reason to turn it on while it is off, and how to get unstuck when the browser won't let it. Empty while the device is still being read. */
export const getDeviceReminderText = (state: DevicePushState | null) => {
  if (state === null) return '';
  if (state === 'on') {
    return 'Pinch can send this device reminders. Turn it off to stop every Moondreams reminder here.';
  }
  if (state === 'blocked') {
    return 'This site is blocked from sending notifications. Allow them in your browser’s site settings, then come back.';
  }
  if (state === 'unsupported') {
    return 'This browser can’t show reminders. On an iPhone or iPad, add this site to your Home Screen and open it from there.';
  }
  return 'Allow notifications so Pinch can nudge you when something needs you, even with the app closed.';
};

/** The note under a failed attempt to turn reminders on; nothing for a closed question, which changed nothing. */
export const getTurnOnFailureText = (
  result: 'on' | 'blocked' | 'unsupported' | 'dismissed' | 'failed',
) =>
  result === 'failed'
    ? 'We couldn’t turn reminders on. Check your connection and try again.'
    : null;

/** Whether the fridge number is past what most food-safety guidance gives for cooked leftovers, so the screen says so quietly. */
export const isAboveFridgeGuidance = (fridgeDays: number) =>
  fridgeDays > FRIDGE_GUIDANCE_DAYS;
