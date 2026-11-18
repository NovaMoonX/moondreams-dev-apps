const DAY_MS = 24 * 60 * 60 * 1000;

/** The zone name when valid, otherwise UTC. */
export const validZone = (zone: string | null | undefined) => {
  if (typeof zone !== 'string' || zone === '') return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
    }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

const offsetAt = (at: number, zone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(at / 1000) * 1000;
};

/** Epoch ms of local midnight starting `dayIso` (YYYY-MM-DD) in `zone`; UTC when the zone is missing or invalid. */
export const startOfDay = (dayIso: string, zone: string | null | undefined) => {
  const resolved = validZone(zone);
  const utcMidnight = Date.parse(`${dayIso}T00:00:00Z`);
  const first = utcMidnight - offsetAt(utcMidnight, resolved);
  return utcMidnight - offsetAt(first, resolved);
};

/** The calendar day (YYYY-MM-DD) `now` falls on in `zone`; UTC when the zone is missing or invalid. */
export const todayIn = (zone: string | null | undefined, now: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: validZone(zone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/** Instant bounds of a from/to day range (to is inclusive) in `zone`; a missing end is null. */
export const dayRangeMs = (
  from: string | null,
  to: string | null,
  zone: string | null | undefined,
) => ({
  fromMs: from === null ? null : startOfDay(from, zone),
  toMsExclusive:
    to === null
      ? null
      : startOfDay(
          new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS)
            .toISOString()
            .slice(0, 10),
          zone,
        ),
});
