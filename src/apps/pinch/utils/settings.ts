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
import type {
  PinchReminderSettings,
  PinchSettings,
  PinchVoiceSettings,
} from '@apps/pinch/types';

export interface UsualDays {
  fridge: number;
  freezer: number;
}

/** What a person with no settings document gets: every reminder on (they still reach this device only once it is allowed), the built-in days, no Calendar stat tiles. */
export const DEFAULT_PINCH_SETTINGS: PinchSettings = {
  fridgeDays: null,
  freezerDays: null,
  suggestPhotos: true,
  calendarStats: false,
  voice: { hasAgreed: null, isReadingAloud: null, isWaiting: null },
  reminders: {
    eatSoon: true,
    expiring: true,
    timers: true,
    leadDays: DEFAULT_LEAD_DAYS,
    hour: DEFAULT_REMINDER_HOUR,
    timeZone: null,
  },
  updatedAt: 0,
  lastDigestDay: null,
};

/** What a reminder kind a stored document predates reads as: off, since the morning note's query finds a person only by a stored `true`, so a switch drawn on there would promise a note that never comes. */
const PREDATING_REMINDERS = { eatSoon: false, expiring: false, timers: false };

/** A stored document with any key it predates filled in, or the defaults themselves when there is none. */
export const getSettingsWithDefaults = (
  document: PinchSettings | null,
): PinchSettings =>
  document === null
    ? DEFAULT_PINCH_SETTINGS
    : {
        ...DEFAULT_PINCH_SETTINGS,
        ...document,
        voice: { ...DEFAULT_PINCH_SETTINGS.voice, ...document.voice },
        reminders: {
          ...DEFAULT_PINCH_SETTINGS.reminders,
          ...PREDATING_REMINDERS,
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
  calendarStats?: boolean;
  voice?: Partial<PinchVoiceSettings>;
  reminders?: Partial<PinchReminderSettings>;
}

/** The whole document for a person's first change: the defaults with their change on top, and the morning note in the zone of the device that made it (a note with no zone goes out at UTC). */
export const createSettings = (
  patch: PinchSettingsPatch,
  now: number,
  timeZone: string | null,
): PinchSettings => ({
  ...DEFAULT_PINCH_SETTINGS,
  fridgeDays: patch.fridgeDays ?? DEFAULT_PINCH_SETTINGS.fridgeDays,
  freezerDays: patch.freezerDays ?? DEFAULT_PINCH_SETTINGS.freezerDays,
  suggestPhotos: patch.suggestPhotos ?? DEFAULT_PINCH_SETTINGS.suggestPhotos,
  calendarStats: patch.calendarStats ?? DEFAULT_PINCH_SETTINGS.calendarStats,
  voice: { ...DEFAULT_PINCH_SETTINGS.voice, ...patch.voice },
  reminders: {
    ...DEFAULT_PINCH_SETTINGS.reminders,
    timeZone,
    ...patch.reminders,
  },
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
  ...(patch.calendarStats === undefined
    ? []
    : [{ path: ['calendarStats'], value: patch.calendarStats }]),
  ...Object.entries(patch.voice ?? {}).flatMap(([key, value]) =>
    value === undefined ? [] : [{ path: ['voice', key], value }],
  ),
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

/** Whether the fridge number is past what most food-safety guidance gives for cooked leftovers, so the screen says so quietly. */
export const isAboveFridgeGuidance = (fridgeDays: number) =>
  fridgeDays > FRIDGE_GUIDANCE_DAYS;
