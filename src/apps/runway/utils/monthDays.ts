export const LAST_DAY = 31;

/** A day of the month with its suffix: "1st", "22nd", "31st". */
export const toDayOrdinal = (day: number) => {
  const tail = day % 100;
  const suffix =
    tail >= 11 && tail <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ??
        'th');
  return `${day}${suffix}`;
};

/** A day of the month in words: "15th", and "Last day" for the 31st, which a short month clamps to its end. */
export const toOrdinal = (day: number) =>
  day === LAST_DAY ? 'Last day' : toDayOrdinal(day);
