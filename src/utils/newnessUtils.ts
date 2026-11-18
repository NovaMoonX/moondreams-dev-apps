const DAY_MS = 86_400_000;

/** How long something added stays marked New for a person who hasn't seen it yet. */
export const NEW_FOR_DAYS = 30;

/** Whether a thing that shipped on `addedOn` (a `YYYY-MM-DD` day, null for "always there") is still recent enough to mark New. */
export const isStillNew = (
  addedOn: string | null,
  now: number,
  days = NEW_FOR_DAYS,
) => {
  if (addedOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(addedOn)) return false;
  const start = Date.parse(`${addedOn}T00:00:00Z`);
  return Number.isFinite(start) && now < start + (days + 1) * DAY_MS;
};
