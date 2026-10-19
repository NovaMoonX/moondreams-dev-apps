// Pure parts of Pinch's morning note, kept free of imports so the app's checks can run them. Its day arithmetic mirrors `getDaysLeft` and `getEatByState` in the app's src/apps/pinch/utils/containers.ts (this package can't import from src); scripts/checks/pinchDigest.ts keeps the two equal.

export const DAY_MS = 86_400_000;
/** A box this many days past its date still counts, so a note about it goes out the morning after and then stops. */
export const DIGEST_PAST_DAYS = 1;
/** A note goes out only in the first half hour of the chosen hour, so a late run drops it instead of sending it hours after. */
export const SEND_WINDOW_MS = 30 * 60_000;
const MAX_NAME_LENGTH = 40;
const NAMES_SHOWN = 2;

/** One thing to act on: a dish or an ingredient, and how many days it is from its date. Negative is past. */
export interface DigestItem {
  name: string;
  daysLeft: number;
  /** Set for an ingredient in the pantry; a dish leaves it out. */
  kind?: 'ingredient';
}

export interface DigestMessage {
  title: string;
  body: string;
}

interface LocalMoment {
  day: string;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string) => {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  formatters.set(timeZone, formatter);
  return formatter;
};

/** A zone the runtime knows, else UTC: a person whose device never gave one still gets a note, at that hour in UTC. */
export const resolveZone = (timeZone: unknown): string => {
  if (typeof timeZone !== 'string' || timeZone === '') return 'UTC';
  try {
    getFormatter(timeZone);
    return timeZone;
  } catch {
    return 'UTC';
  }
};

/** The wall clock in a zone: its calendar day as `YYYY-MM-DD`, the hour and the minute. */
export const getLocalMoment = (now: number, timeZone: string): LocalMoment => {
  const parts = getFormatter(resolveZone(timeZone)).formatToParts(now);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return {
    day: `${read('year')}-${read('month')}-${read('day')}`,
    hour: Number(read('hour')),
    minute: Number(read('minute')),
  };
};

/** A local day as UTC midnight, the way a box's `eatBy` is stored. */
export const dayToUtcMidnight = (day: string) => Date.parse(`${day}T00:00:00Z`);

export interface DigestSettings {
  hour: number;
  timeZone: string | null;
  lastDigestDay: string | null;
}

/** The local day and its UTC midnight when this run is the one that sends the person's note: their hour has begun (within the last half hour) and today's has not gone out. Null otherwise. */
export const getDigestRun = (now: number, settings: DigestSettings) => {
  const moment = getLocalMoment(now, resolveZone(settings.timeZone));
  const isInWindow =
    moment.hour === settings.hour && moment.minute * 60_000 < SEND_WINDOW_MS;
  if (!isInWindow || settings.lastDigestDay === moment.day) return null;
  return { day: moment.day, today: dayToUtcMidnight(moment.day) };
};

/** The `eatBy` bounds (inclusive, both UTC midnights) of the boxes a note about `today` counts. */
export const getDigestBounds = (today: number, leadDays: number) => ({
  from: today - DIGEST_PAST_DAYS * DAY_MS,
  to: today + leadDays * DAY_MS,
});

export const getDaysLeft = (eatBy: number, today: number) =>
  Math.round((eatBy - today) / DAY_MS);

const cleanName = (title: string) => {
  const text = title.replace(/\s+/g, ' ').trim();
  return text.length > MAX_NAME_LENGTH
    ? `${text.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`
    : text;
};

/** One item per dish, however many boxes of it there are, at its nearest date; nearest first. A box with no usable title or date is skipped. */
export const toDigestItems = (
  boxes: { title: unknown; eatBy: unknown }[],
  today: number,
): DigestItem[] => {
  const byName = boxes.reduce((acc, box) => {
    if (typeof box.title !== 'string' || typeof box.eatBy !== 'number') {
      return acc;
    }
    const name = cleanName(box.title);
    if (name === '') return acc;
    const key = name.toLowerCase();
    const daysLeft = getDaysLeft(box.eatBy, today);
    const known = acc.get(key);
    return known && known.daysLeft <= daysLeft
      ? acc
      : acc.set(key, { name, daysLeft });
  }, new Map<string, DigestItem>());

  return Array.from(byName.values()).sort(
    (a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name),
  );
};

/** One item per ingredient, however many packages of it there are, at its nearest date; nearest first. A package with no usable name or date is skipped. */
export const toPackageDigestItems = (
  packages: { ingredientName: unknown; expiresAt: unknown }[],
  today: number,
): DigestItem[] => {
  const byName = packages.reduce((acc, pkg) => {
    if (
      typeof pkg.ingredientName !== 'string' ||
      typeof pkg.expiresAt !== 'number'
    ) {
      return acc;
    }
    const name = cleanName(pkg.ingredientName);
    if (name === '') return acc;
    const key = name.toLowerCase();
    const daysLeft = getDaysLeft(pkg.expiresAt, today);
    const known = acc.get(key);
    return known && known.daysLeft <= daysLeft
      ? acc
      : acc.set(key, { name, daysLeft, kind: 'ingredient' });
  }, new Map<string, DigestItem>());

  return Array.from(byName.values()).sort(
    (a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name),
  );
};

/** Every source's items as one list, nearest first; a dish and an ingredient with the same name are one thing to look at, at the nearer date, and the dish keeps it. */
export const mergeDigestItems = (lists: DigestItem[][]): DigestItem[] => {
  const byName = lists.flat().reduce((acc, entry) => {
    const key = entry.name.toLowerCase();
    const known = acc.get(key);
    const isNearer =
      known === undefined ||
      entry.daysLeft < known.daysLeft ||
      (entry.daysLeft === known.daysLeft &&
        known.kind === 'ingredient' &&
        entry.kind === undefined);
    return isNearer ? acc.set(key, entry) : acc;
  }, new Map<string, DigestItem>());

  return Array.from(byName.values()).sort(
    (a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name),
  );
};

export const DIGEST_LINK_FRIDGE = '/pinch?tab=kitchen&open=fridge';
export const DIGEST_LINK_PANTRY = '/pinch?tab=kitchen&open=pantry';

/** The note opens the fridge while it names a dish, and the pantry when it is only ingredients. */
export const getDigestLink = (items: DigestItem[]) =>
  items.some((entry) => entry.kind !== 'ingredient')
    ? DIGEST_LINK_FRIDGE
    : DIGEST_LINK_PANTRY;

/** "A", "A and B", "A, B and 3 more": two names at most. */
export const formatNames = (items: DigestItem[]) => {
  const names = items.slice(0, NAMES_SHOWN).map((item) => item.name);
  const rest = items.length - NAMES_SHOWN;
  if (rest > 0) return `${names.join(', ')} and ${rest} more`;
  return names.join(' and ');
};

const getWhen = (items: DigestItem[]) => {
  const first = items[0].daysLeft;
  if (items.some((item) => item.daysLeft !== first)) return 'soon';
  if (first === 0) return 'today';
  if (first === 1) return 'tomorrow';
  return `in ${first} days`;
};

/** The one push: names what is past its date first, then what is due, and says only what the person's own phone shows. Null when there is nothing to say. */
export const getDigestMessage = (items: DigestItem[]): DigestMessage | null => {
  const past = items.filter((item) => item.daysLeft < 0);
  const due = items.filter((item) => item.daysLeft >= 0);
  if (past.length === 0 && due.length === 0) return null;

  // An ingredient in the list makes it a note about the kitchen, which says what needs a look, not which of its words fit a dish.
  if (items.some((item) => item.kind === 'ingredient')) {
    return {
      title: 'Check your kitchen',
      body: `${formatNames(items)} ${items.length === 1 ? 'needs' : 'need'} a look`,
    };
  }

  const be = (list: DigestItem[]) => (list.length === 1 ? 'is' : 'are');
  const its = (list: DigestItem[]) => (list.length === 1 ? 'its' : 'their');

  if (past.length === 0) {
    return {
      title: 'Eat soon',
      body: `${formatNames(due)} ${be(due)} due ${getWhen(due)}`,
    };
  }

  const pastText = `${formatNames(past)} ${be(past)} past ${its(past)} date`;
  return {
    title: 'Check your fridge and freezer',
    body:
      due.length === 0
        ? pastText
        : `${pastText}, and ${due.length} more ${be(due)} due soon`,
  };
};
