const MINUTES_PER_DAY = 1440;

export interface DayTime {
  day: number;
  time: string;
}

function toMinutesOfDay(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const result = (hours || 0) * 60 + (minutes || 0);
  return result;
}

export function toDayMinutes(day: number, time: string) {
  const result = day * MINUTES_PER_DAY + toMinutesOfDay(time);
  return result;
}

export function fromDayMinutes(total: number): DayTime {
  const day = Math.floor(total / MINUTES_PER_DAY);
  const minutes = total - day * MINUTES_PER_DAY;
  const pad = (value: number) => value.toString().padStart(2, '0');
  const result = { day, time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
  return result;
}

export function compareDayTime(a: DayTime, b: DayTime) {
  const result = toDayMinutes(a.day, a.time) - toDayMinutes(b.day, b.time);
  return result;
}

/** With `max`, the end is capped there and the range shrinks rather than overflowing. */
export function shiftRangeEnd({
  start,
  end,
  nextStart,
  max,
}: {
  start: DayTime;
  end: DayTime;
  nextStart: DayTime;
  max?: DayTime;
}): DayTime {
  const duration = toDayMinutes(end.day, end.time) - toDayMinutes(start.day, start.time);
  const nextEnd = toDayMinutes(nextStart.day, nextStart.time) + duration;
  const capped = max ? Math.min(nextEnd, toDayMinutes(max.day, max.time)) : nextEnd;
  const result = fromDayMinutes(capped);
  return result;
}
