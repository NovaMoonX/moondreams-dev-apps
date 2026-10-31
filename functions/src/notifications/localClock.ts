/** The wall-clock date ("YYYY-MM-DD") and hour in an IANA zone; an unknown zone reads as UTC. */
export function getLocalClock(now: number, timeZone: string | null): { date: string; hour: number } {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00';
    return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
  };
  try {
    return read(timeZone ?? 'UTC');
  } catch {
    return read('UTC');
  }
}
