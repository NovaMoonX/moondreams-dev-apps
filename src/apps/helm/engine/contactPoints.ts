export type ContactKind = 'phone' | 'email';

/** One phone number or email of a person, pet or organization; exactly one of each kind is primary when any exist. */
export interface ContactPoint {
  id: string;
  value: string;
  label: string;
  isPrimary: boolean;
}

export const MAX_CONTACT_POINTS = 10;
export const CONTACT_LABEL_CAP = 20;
export const CONTACT_VALUE_CAP = 254;
export const CONTACT_LABELS = ['Mobile', 'Home', 'Work', 'Other'] as const;
export const OTHER_LABEL = 'Other';

/** The label a new entry starts with. */
export const defaultLabelFor = (kind: ContactKind) =>
  kind === 'phone' ? 'Mobile' : 'Home';

/** The words a payload sealed before the lists holds, and the lists that replace them. */
export interface ContactWords {
  phones?: unknown;
  emails?: unknown;
  phone?: unknown;
  email?: unknown;
}

const squash = (text: string) => text.trim().replace(/\s+/g, ' ');

/** A phone's digits as the comparison key: the last 10 once there are 7 or more, null for anything shorter. */
export const toPhoneKey = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
};

/** What makes two entries the same: an email ignoring case, a phone by its digits. Null when nothing comparable was typed. */
export const toContactKey = (kind: ContactKind, value: string) => {
  if (kind === 'email') {
    const email = squash(value).toLowerCase();
    return email === '' ? null : email;
  }
  const digits = value.replace(/\D/g, '');
  return toPhoneKey(value) ?? (digits === '' ? null : digits);
};

/** A label settled: one of the four kept as written in the list, the person's own word cut to 20 characters, and Other when empty. */
export const toContactLabel = (label: unknown) => {
  const text =
    typeof label === 'string' ? squash(label).slice(0, CONTACT_LABEL_CAP) : '';
  if (text === '') return OTHER_LABEL;
  return (
    CONTACT_LABELS.find(
      (entry) => entry.toLowerCase() === text.toLowerCase(),
    ) ?? text.trim()
  );
};

/** Exactly one primary when the list holds any: the first marked one, else the first entry. */
export const ensureOnePrimary = (points: ContactPoint[]): ContactPoint[] => {
  const primaryId = (points.find((point) => point.isPrimary) ?? points[0])?.id;
  return points.map((point) => ({
    ...point,
    isPrimary: point.id === primaryId,
  }));
};

/** The primary first, the rest in the order they were added. */
export const sortPrimaryFirst = (points: ContactPoint[]) => [
  ...points.filter((point) => point.isPrimary),
  ...points.filter((point) => !point.isPrimary),
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A stored list read safely: unreadable entries and repeats are dropped, labels settled, the cap applied and one primary kept. */
export const toContactPoints = (
  kind: ContactKind,
  value: unknown,
): ContactPoint[] => {
  const seen = new Set<string>();
  const points = (Array.isArray(value) ? value : []).flatMap(
    (entry: unknown, index): ContactPoint[] => {
      if (!isRecord(entry)) return [];
      const text =
        typeof entry.value === 'string'
          ? squash(entry.value).slice(0, CONTACT_VALUE_CAP)
          : '';
      const key = toContactKey(kind, text);
      if (key === null || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          id:
            typeof entry.id === 'string' ? entry.id : `legacy-${kind}-${index}`,
          value: text,
          label: toContactLabel(entry.label),
          isPrimary: entry.isPrimary === true,
        },
      ];
    },
  );
  return ensureOnePrimary(points.slice(0, MAX_CONTACT_POINTS));
};

/** A who's phones or emails: the list when the payload has one, else the single value a payload sealed before the lists held, as one primary entry labelled Other. */
export const readContactPoints = (
  kind: ContactKind,
  words: ContactWords,
): ContactPoint[] => {
  const list = kind === 'phone' ? words.phones : words.emails;
  if (Array.isArray(list)) return toContactPoints(kind, list);
  const legacy = kind === 'phone' ? words.phone : words.email;
  return typeof legacy === 'string' && squash(legacy) !== ''
    ? toContactPoints(kind, [
        {
          id: `legacy-${kind}`,
          value: legacy,
          label: OTHER_LABEL,
          isPrimary: true,
        },
      ])
    : [];
};

export type ContactRefusal = 'empty' | 'duplicate' | 'full';

const toResult = (points: ContactPoint[]): { points: ContactPoint[] } => ({
  points: ensureOnePrimary(points),
});

/** Adds an entry: the first of its kind is primary, a repeat (same email, same phone digits) or an 11th is refused. */
export const addContactPoint = (
  kind: ContactKind,
  points: ContactPoint[],
  entry: { id: string; value: string; label: string },
): { points: ContactPoint[] } | ContactRefusal => {
  const value = squash(entry.value).slice(0, CONTACT_VALUE_CAP);
  const key = toContactKey(kind, value);
  if (key === null) return 'empty';
  if (points.some((point) => toContactKey(kind, point.value) === key))
    return 'duplicate';
  if (points.length >= MAX_CONTACT_POINTS) return 'full';
  return toResult([
    ...points,
    {
      id: entry.id,
      value,
      label: toContactLabel(entry.label),
      isPrimary: points.length === 0,
    },
  ]);
};

/** Changes an entry's value and label; a value another entry already holds is refused. */
export const changeContactPoint = (
  kind: ContactKind,
  points: ContactPoint[],
  id: string,
  entry: { value: string; label: string },
): { points: ContactPoint[] } | ContactRefusal => {
  const value = squash(entry.value).slice(0, CONTACT_VALUE_CAP);
  const key = toContactKey(kind, value);
  if (key === null) return 'empty';
  if (
    points.some(
      (point) => point.id !== id && toContactKey(kind, point.value) === key,
    )
  )
    return 'duplicate';
  return toResult(
    points.map((point) =>
      point.id === id
        ? { ...point, value, label: toContactLabel(entry.label) }
        : point,
    ),
  );
};

/** Removes an entry; removing the primary makes the next one primary. */
export const removeContactPoint = (points: ContactPoint[], id: string) =>
  ensureOnePrimary(points.filter((point) => point.id !== id));

/** Makes one entry primary; an id the list no longer holds leaves it as it was. */
export const makePrimaryContactPoint = (points: ContactPoint[], id: string) =>
  points.some((point) => point.id === id)
    ? points.map((point) => ({ ...point, isPrimary: point.id === id }))
    : ensureOnePrimary(points);

/** Puts a removed entry back at its old place, refused like an add; a primary stays primary. */
export const restoreContactPoint = (
  kind: ContactKind,
  points: ContactPoint[],
  entry: ContactPoint,
  index: number,
): { points: ContactPoint[] } | ContactRefusal => {
  const added = addContactPoint(kind, points, entry);
  if (typeof added === 'string') return added;
  const without = added.points.filter((point) => point.id !== entry.id);
  const at = Math.max(0, Math.min(index, without.length));
  const restored = [
    ...without.slice(0, at),
    added.points.find((point) => point.id === entry.id) as ContactPoint,
    ...without.slice(at),
  ];
  return {
    points: entry.isPrimary
      ? makePrimaryContactPoint(restored, entry.id)
      : restored,
  };
};

/** What the edit sheet changed in one list: its adds, changes and removals by id, and the entry the person made primary. */
export interface ContactListDiff {
  added: ContactPoint[];
  changed: ContactPoint[];
  removedIds: string[];
  primaryId: string | null;
}

/** The difference between a list as it was loaded and as the person left it. */
export const diffContactPoints = (
  before: ContactPoint[],
  after: ContactPoint[],
): ContactListDiff => {
  const was = new Map(before.map((point) => [point.id, point]));
  const now = new Set(after.map((point) => point.id));
  const primaryNow = after.find((point) => point.isPrimary)?.id ?? null;
  return {
    added: after.filter((point) => !was.has(point.id)),
    changed: after.filter((point) => {
      const old = was.get(point.id);
      return (
        old !== undefined &&
        (old.value !== point.value || old.label !== point.label)
      );
    }),
    removedIds: before.filter((point) => !now.has(point.id)).map((p) => p.id),
    primaryId:
      primaryNow !== null &&
      primaryNow !== before.find((point) => point.isPrimary)?.id
        ? primaryNow
        : null,
  };
};

/** A diff applied to a fresh list: removals, changes and adds in turn with the duplicate and cap checks re-run; an entry removed elsewhere meanwhile is not brought back by a change. */
export const applyContactDiff = (
  kind: ContactKind,
  points: ContactPoint[],
  diff: ContactListDiff,
): { points: ContactPoint[] } | ContactRefusal => {
  const removed = diff.removedIds.reduce(removeContactPoint, points);
  const changed = diff.changed.reduce<
    { points: ContactPoint[] } | ContactRefusal
  >(
    (result, entry) =>
      typeof result === 'string' ||
      !result.points.some((point) => point.id === entry.id)
        ? result
        : changeContactPoint(kind, result.points, entry.id, entry),
    { points: removed },
  );
  const added = diff.added.reduce<{ points: ContactPoint[] } | ContactRefusal>(
    (result, entry) =>
      typeof result === 'string'
        ? result
        : addContactPoint(kind, result.points, entry),
    changed,
  );
  if (typeof added === 'string') return added;
  return {
    points:
      diff.primaryId === null
        ? added.points
        : makePrimaryContactPoint(added.points, diff.primaryId),
  };
};

/** The entry labelled as asked ("work"), else the primary. */
export const pickContactPoint = (
  points: ContactPoint[],
  label: string | null,
) =>
  (label === null
    ? undefined
    : points.find(
        (point) => point.label.toLowerCase() === label.trim().toLowerCase(),
      )) ??
  points.find((point) => point.isPrimary) ??
  null;
