export const LAST_DAY = 31;

/** A day of the month in words: "15th", and "Last day" for the 31st, which a short month clamps to its end. */
export const toOrdinal = (day: number) => {
  if (day === LAST_DAY) return 'Last day';
  const tail = day % 100;
  const suffix =
    tail >= 11 && tail <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ??
        'th');
  return `${day}${suffix}`;
};
