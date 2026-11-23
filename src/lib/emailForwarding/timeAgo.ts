const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "2 hours ago", "yesterday"; "just now" inside the first minute. */
export function formatTimeAgo(at: number, now: number) {
  const elapsed = Math.max(0, now - at);
  const unit = UNITS.find(([, size]) => elapsed >= size);
  if (!unit) return 'just now';
  return formatter.format(-Math.floor(elapsed / unit[1]), unit[0]);
}
