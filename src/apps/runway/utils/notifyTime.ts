/** "9:00 am", "12:00 pm". */
export const formatNotifyHour = (hour: number) => {
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

/** The short name of a zone as it is at `at` ("PDT"), or an empty string when the zone is unknown. */
export const getZoneAbbreviation = (timeZone: string | null, at: number) => {
  if (timeZone === null) return '';
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
};
