import { MEETING_FORMAT_OPTIONS } from '@apps/helm/constants';
import type { MeetingFormat, SyncedRecord } from '@apps/helm/types';

/** Reads a format from a stored value; anything but the three known words is no format. */
export const readMeetingFormat = (value: unknown): MeetingFormat | null =>
  MEETING_FORMAT_OPTIONS.find((option) => option.value === value)?.value ??
  null;

/** The format a calendar copy carries, or one of the same event's other copies. */
export const findMeetingFormat = (
  shown: SyncedRecord,
  others: SyncedRecord[] = [],
): MeetingFormat | null =>
  [shown, ...others]
    .map((copy) => readMeetingFormat(copy.sealed.extra.format))
    .find((format) => format !== null) ?? null;

/** The words a meeting's line ends with, one per part: the format ("Video", "In person") then the place; empty when neither is known. */
export const getMeetingWhereParts = (
  how: MeetingFormat | null,
  place: string | null,
): { format: string | null; place: string | null } => ({
  format:
    MEETING_FORMAT_OPTIONS.find((option) => option.value === how)?.label ??
    null,
  place: place?.trim() || null,
});

/** "Video", "In person · Milstead & Co.", "Milstead & Co." or null, for a line drawn as plain text. */
export const formatMeetingWhere = (
  how: MeetingFormat | null,
  place: string | null,
) => {
  const parts = getMeetingWhereParts(how, place);
  const line = [parts.format, parts.place].filter(Boolean).join(' · ');
  return line || null;
};
