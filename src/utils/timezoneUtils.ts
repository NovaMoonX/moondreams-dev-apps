let cachedTimezoneOptions: { value: string; text: string }[] | null = null;

/** IANA zone name ("America/Los_Angeles") -> readable label ("America / Los Angeles"), no underscores. */
export function formatTimezoneLabel(zone: string): string {
  return zone
    .split('/')
    .map((part) => part.replace(/_/g, ' '))
    .join(' / ');
}

/** Every IANA timezone the runtime supports, as `{ value, text }` select options sorted by label. */
export function getTimezoneOptions(): { value: string; text: string }[] {
  if (cachedTimezoneOptions) {
    return cachedTimezoneOptions;
  }

  const zones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
  cachedTimezoneOptions = zones
    .map((zone) => ({ value: zone, text: formatTimezoneLabel(zone) }))
    .sort((a, b) => a.text.localeCompare(b.text));

  return cachedTimezoneOptions;
}
