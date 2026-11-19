// Pure and import-free: the server vendors this file as is (`check:server-copies`).

/** Where the person put a project, goal or habit in what matters most, in their own words. Higher ranks come first, equal ranks sit side by side, a negative rank is Can wait. */
export interface ImportancePlace {
  rank: number;
  words: string | null;
  saidAt: number;
  /** Date-only, inclusive: past it the place reads as not said. */
  until: number | null;
  /** The turn it came from; null when set by hand. */
  captureId: string | null;
}

export const IMPORTANCE_WORDS_CAP = 120;
/** A rank closer than this to a neighbour is spaced out again. */
export const RANK_MIN_GAP = 2 ** -30;
/** This many things in one place is too many to leave side by side. */
export const TIE_ASKED_AT = 3;
/** The place number the planner gives a project nobody placed, after every placed one. */
export const NOT_SAID_PLACE = 1e5;
/** Can wait projects come after every placed and not said one, in their order. */
export const CAN_WAIT_PLACE = 1e6;

export type ImportanceKind = 'project' | 'goal' | 'habit';

export interface ImportanceItem {
  id: string;
  kind: ImportanceKind;
  name: string;
  place: ImportancePlace | null;
  /** A habit's goal; while the goal is in the order the habit sits at its place and ignores any of its own. */
  goalId: string | null;
  /** Health and care: never placed, never paused. */
  isCare: boolean;
  /** `out` is finished, ended or deleted: left out, and back where it was when reopened. */
  status: 'running' | 'paused' | 'out';
  /** Its nearest open date (a target date or a dated milestone), date-only. */
  date: number | null;
}

export type OrderGroup = 'inOrder' | 'notSaid' | 'canWait';

export interface OrderRow {
  id: string;
  kind: ImportanceKind;
  group: OrderGroup;
  /** The rank it reads at: its own, or its goal's for a habit with none. Null in Not said yet. */
  rank: number | null;
  /** The place number in In order (ties share one), from 1; null elsewhere. */
  position: number | null;
  isPaused: boolean;
  /** A habit sitting at its goal's place. */
  isInherited: boolean;
  /** Its own place ran out (`until` passed) and it reads as not said. */
  isExpired: boolean;
  /** What placed it, while the place stands. */
  place: ImportancePlace | null;
  date: number | null;
}

export interface ImportanceOrder {
  /** In order, then Not said yet, then Can wait. */
  rows: OrderRow[];
  inOrder: OrderRow[];
  notSaid: OrderRow[];
  canWait: OrderRow[];
  /** Health and care, which the order never holds. */
  alwaysKept: string[];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A stored place, or null for anything malformed (a rank of 0 says nothing). */
export const readPlace = (value: unknown): ImportancePlace | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { rank, words, saidAt, until, captureId } = value as Record<
    string,
    unknown
  >;
  if (!isFiniteNumber(rank) || rank === 0 || !isFiniteNumber(saidAt))
    return null;
  if (words !== null && typeof words !== 'string') return null;
  if (until !== null && !isFiniteNumber(until)) return null;
  if (captureId !== null && typeof captureId !== 'string') return null;
  return {
    rank,
    words: words === null ? null : words.slice(0, IMPORTANCE_WORDS_CAP),
    saidAt,
    until,
    captureId,
  };
};

/** The place while it stands: one whose `until` has passed reads as not said. `today` is date-only. */
export const livePlace = (place: ImportancePlace | null, today: number) =>
  place && !(place.until !== null && today > place.until) ? place : null;

/** The soonest of some dates, or null when there are none. */
export const nearestDate = (dates: (number | null)[]) =>
  dates.reduce<number | null>(
    (soonest, date) =>
      date !== null && (soonest === null || date < soonest) ? date : soonest,
    null,
  );

const byDate = (left: OrderRow, right: OrderRow) =>
  (left.date ?? Infinity) - (right.date ?? Infinity);

const compareWith =
  (names: Map<string, string>) => (left: OrderRow, right: OrderRow) =>
    byDate(left, right) ||
    (names.get(left.id) ?? '').localeCompare(names.get(right.id) ?? '');

const isGoalInOrder = (item: ImportanceItem) =>
  item.kind !== 'habit' && item.status !== 'out' && !item.isCare;

/** The ids of the habits that take their goal's place: the goal is still in the order (live, not health or care). Such a habit ignores any place of its own, is never listed apart and never counted in a place or a tie; one whose goal has left the order is listed on its own. */
export const readUnderGoalIds = (items: readonly ImportanceItem[]) => {
  const goals = new Set(items.filter(isGoalInOrder).map((item) => item.id));
  return items
    .filter(
      (item) =>
        item.kind === 'habit' && item.goalId !== null && goals.has(item.goalId),
    )
    .map((item) => item.id);
};

/** The order at a day: the placed by rank (ties side by side), then the unplaced by nearest date (undated last), then Can wait. Finished things are left out; paused ones keep their place, marked. A goal's habits follow their goal's row at its place, in `rows` only. */
export function readImportanceOrder(
  items: readonly ImportanceItem[],
  today: number,
): ImportanceOrder {
  const kept = items.filter((item) => item.status !== 'out');
  const names = new Map(kept.map((item) => [item.id, item.name]));
  const goals = new Map(
    kept.filter(isGoalInOrder).map((item) => [item.id, item]),
  );
  const underGoal = new Set(readUnderGoalIds(items));
  const alwaysKept = kept.filter((item) => item.isCare).map((item) => item.id);
  const rows = kept
    .filter((item) => !item.isCare)
    .map((item): OrderRow => {
      const isUnder = underGoal.has(item.id);
      const own = isUnder ? null : livePlace(item.place, today);
      const goal =
        !own && item.goalId
          ? livePlace(goals.get(item.goalId)?.place ?? null, today)
          : null;
      const rank = own?.rank ?? goal?.rank ?? null;
      return {
        id: item.id,
        kind: item.kind,
        group: rank === null ? 'notSaid' : rank > 0 ? 'inOrder' : 'canWait',
        rank,
        position: null,
        isPaused: item.status === 'paused',
        isInherited: !own && goal !== null,
        isExpired: !isUnder && item.place !== null && own === null,
        place: own ?? goal,
        date: item.date,
      };
    });
  const listed = rows.filter((row) => !underGoal.has(row.id));
  const compare = compareWith(names);
  const inOrder = listed
    .filter((row) => row.group === 'inOrder')
    .sort(
      (left, right) =>
        (right.rank ?? 0) - (left.rank ?? 0) || compare(left, right),
    );
  const places = [...new Set(inOrder.map((row) => row.rank))];
  const numbered = inOrder.map((row) => ({
    ...row,
    position: places.indexOf(row.rank) + 1,
  }));
  const positions = new Map(numbered.map((row) => [row.id, row.position]));
  const goalIdOf = new Map(items.map((item) => [item.id, item.goalId]));
  const notSaid = listed.filter((row) => row.group === 'notSaid').sort(compare);
  const canWait = listed
    .filter((row) => row.group === 'canWait')
    .sort(
      (left, right) =>
        (right.rank ?? 0) - (left.rank ?? 0) || compare(left, right),
    );
  const beside = rows
    .filter((row) => underGoal.has(row.id))
    .map((row) => ({
      ...row,
      position:
        row.group === 'inOrder'
          ? (positions.get(goalIdOf.get(row.id) ?? '') ?? null)
          : null,
    }));
  return {
    rows: [...numbered, ...notSaid, ...canWait, ...beside],
    inOrder: numbered,
    notSaid,
    canWait,
    alwaysKept,
  };
}

/** The ranks spaced evenly with ties and order kept: 1 at the foot of In order, -1 at the top of Can wait. */
export function renumberRanks(ranks: ReadonlyMap<string, number>) {
  const values = [...ranks.values()];
  const positive = [...new Set(values.filter((rank) => rank > 0))].sort(
    (left, right) => right - left,
  );
  const negative = [...new Set(values.filter((rank) => rank < 0))].sort(
    (left, right) => right - left,
  );
  return new Map(
    [...ranks].map(([id, rank]) => [
      id,
      rank > 0
        ? positive.length - positive.indexOf(rank)
        : rank < 0
          ? -(negative.indexOf(rank) + 1)
          : 0,
    ]),
  );
}

const isCrowded = (ranks: Iterable<number>) => {
  const positive = [...new Set([...ranks].filter((rank) => rank > 0))].sort(
    (left, right) => left - right,
  );
  const negative = [...new Set([...ranks].filter((rank) => rank < 0))].sort(
    (left, right) => right - left,
  );
  const gaps = (values: number[], from: number) =>
    values.some(
      (value, index) =>
        value - (index === 0 ? from : values[index - 1]) < RANK_MIN_GAP,
    );
  return (
    gaps(positive, 0) ||
    negative.some(
      (value, index) =>
        (index === 0 ? 0 : negative[index - 1]) - value < RANK_MIN_GAP,
    )
  );
};

export type ImportanceRelation =
  'most' | 'above' | 'below' | 'same' | 'matters' | 'canWait' | 'clear';

export interface ImportanceCommand {
  subjectId: string;
  relation: ImportanceRelation;
  /** What `above`, `below` and `same` are measured against. */
  otherId: string | null;
  words: string | null;
  until: number | null;
  captureId: string | null;
}

export interface PlaceChange {
  id: string;
  place: ImportancePlace | null;
}

export type ApplyResult =
  | { kind: 'applied'; changes: PlaceChange[]; isRenumbered: boolean }
  | { kind: 'unchanged'; reason: 'already' | 'otherNotPlaced' }
  | { kind: 'refused'; reason: 'care'; id: string }
  | { kind: 'missing'; id: string };

const distinctRanks = (order: ImportanceOrder, except: string[]) =>
  [
    ...new Set(
      order.inOrder
        .filter((row) => !except.includes(row.id))
        .flatMap((row) => (row.rank === null ? [] : [row.rank])),
    ),
  ].sort((left, right) => left - right);

const rankJustAbove = (ranks: number[], rank: number) => {
  const next = ranks.find((value) => value > rank);
  return next === undefined ? rank + 1 : (rank + next) / 2;
};

const rankJustBelow = (ranks: number[], rank: number) => {
  const previous = [...ranks].reverse().find((value) => value < rank);
  return previous === undefined ? rank / 2 : (rank + previous) / 2;
};

const rankAtFoot = (ranks: number[]) => (ranks.length === 0 ? 1 : ranks[0] / 2);

const rankBelowCanWait = (order: ImportanceOrder, except: string) =>
  Math.min(
    0,
    ...order.canWait
      .filter((row) => row.id !== except)
      .map((row) => row.rank ?? 0),
  ) - 1;

/** The rank each relation gives the subject, or null when it already holds. Code does this arithmetic; the model only reads which relation was said. */
function rankFor(
  order: ImportanceOrder,
  subject: OrderRow,
  relation: ImportanceRelation,
  other: OrderRow | null,
): number | null | 'otherNotPlaced' {
  const ranks = distinctRanks(order, [subject.id]);
  const isIn = subject.group === 'inOrder';
  if (relation === 'most') {
    const top = ranks[ranks.length - 1];
    return isIn && (top === undefined || (subject.rank ?? 0) > top)
      ? null
      : (top ?? 0) + 1;
  }
  if (relation === 'matters') return isIn ? null : rankAtFoot(ranks);
  if (relation === 'canWait')
    return subject.group === 'canWait'
      ? null
      : rankBelowCanWait(order, subject.id);
  if (relation === 'clear') return null;
  if (!other) return null;
  const isOtherIn = other.group === 'inOrder' && other.rank !== null;
  if (relation === 'same')
    return !isOtherIn
      ? 'otherNotPlaced'
      : subject.rank === other.rank
        ? null
        : other.rank;
  if (relation === 'above') {
    if (!isOtherIn) return isIn ? null : rankAtFoot(ranks);
    return isIn && (subject.rank ?? 0) > (other.rank ?? 0)
      ? null
      : rankJustAbove(ranks, other.rank ?? 0);
  }
  if (!isOtherIn) return 'otherNotPlaced';
  return isIn && (subject.rank ?? 0) < (other.rank ?? 0)
    ? null
    : rankJustBelow(ranks, other.rank ?? 0);
}

const placeAt = (
  command: ImportanceCommand,
  rank: number,
  now: number,
): ImportancePlace => ({
  rank,
  words: command.words?.slice(0, IMPORTANCE_WORDS_CAP) ?? null,
  saidAt: now,
  until: command.until,
  captureId: command.captureId,
});

/** Turns one said relation into the places that change, renumbering everything when a gap would get too small. Health and care are refused, never placed. */
export function applyImportance(
  order: ImportanceOrder,
  command: ImportanceCommand,
  now: number,
): ApplyResult {
  const named = [command.subjectId, command.otherId].flatMap((id) => id ?? []);
  const careId = named.find((id) => order.alwaysKept.includes(id));
  if (careId) return { kind: 'refused', reason: 'care', id: careId };
  const subject = order.rows.find((row) => row.id === command.subjectId);
  if (!subject) return { kind: 'missing', id: command.subjectId };
  const other = command.otherId
    ? (order.rows.find((row) => row.id === command.otherId) ?? null)
    : null;
  if (command.otherId && !other)
    return { kind: 'missing', id: command.otherId };
  if (
    command.relation === 'below' &&
    subject &&
    other &&
    other.group !== 'inOrder'
  ) {
    // "Work matters less than guitar" with guitar unplaced puts guitar just above work.
    return subject.group === 'inOrder'
      ? applyImportance(
          order,
          {
            ...command,
            subjectId: other.id,
            relation: 'above',
            otherId: subject.id,
          },
          now,
        )
      : { kind: 'unchanged', reason: 'otherNotPlaced' };
  }
  if (command.relation === 'clear') {
    return subject.place === null && !subject.isExpired
      ? { kind: 'unchanged', reason: 'already' }
      : {
          kind: 'applied',
          changes: [{ id: subject.id, place: null }],
          isRenumbered: false,
        };
  }
  const rank = rankFor(order, subject, command.relation, other);
  if (rank === 'otherNotPlaced')
    return { kind: 'unchanged', reason: 'otherNotPlaced' };
  if (rank === null) return { kind: 'unchanged', reason: 'already' };
  const own = new Map(
    order.rows.flatMap((row) =>
      row.place && !row.isInherited && row.rank !== null
        ? [[row.id, row.rank] as const]
        : [],
    ),
  ).set(subject.id, rank);
  const isRenumbered = isCrowded(own.values());
  const settled = isRenumbered ? renumberRanks(own) : own;
  const changes = [
    {
      id: subject.id,
      place: placeAt(command, settled.get(subject.id) ?? rank, now),
    },
    ...(isRenumbered
      ? order.rows.flatMap((row): PlaceChange[] =>
          row.id !== subject.id &&
          row.place &&
          !row.isInherited &&
          settled.get(row.id) !== row.rank
            ? [
                {
                  id: row.id,
                  place: {
                    ...row.place,
                    rank: settled.get(row.id) ?? row.place.rank,
                  },
                },
              ]
            : [],
        )
      : []),
  ];
  return { kind: 'applied', changes, isRenumbered };
}

/** The items as they stand once the changes are written. */
export const withPlaceChanges = (
  items: readonly ImportanceItem[],
  changes: readonly PlaceChange[],
): ImportanceItem[] =>
  items.map((item) => {
    const change = changes.find(({ id }) => id === item.id);
    return change ? { ...item, place: change.place } : item;
  });

export interface ImportanceTie {
  rank: number;
  /** Every thing in the place, nearest date first. */
  ids: string[];
  isTop: boolean;
}

/** The place 3 or more things now share, the top one first. `touched` limits it to places one of those things sits in, so a tie is asked about again only when something new joins it. Things sitting at a goal's place are not the person's own placing and don't count. */
export function findImportanceTie(
  order: ImportanceOrder,
  touched?: ReadonlySet<string>,
): ImportanceTie | null {
  const own = order.inOrder.filter((row) => !row.isInherited);
  const tied = [...new Set(own.map((row) => row.rank))]
    .map((rank) => ({
      rank: rank ?? 0,
      rows: own.filter((row) => row.rank === rank),
    }))
    .filter(
      ({ rows }) =>
        rows.length >= TIE_ASKED_AT &&
        (!touched || rows.some((row) => touched.has(row.id))),
    )
    .sort((left, right) => right.rank - left.rank)[0];
  if (!tied) return null;
  return {
    rank: tied.rank,
    ids: [...tied.rows].sort(byDate).map((row) => row.id),
    isTop: tied.rows[0].position === 1,
  };
}

/** Each project's or goal's place number, which Today's planner breaks ties by: its place in In order, then every not said one together, then Can wait in its order. Always finite. */
export const readProjectPlaces = (order: ImportanceOrder) =>
  Object.fromEntries([
    ...order.inOrder
      .filter((row) => row.kind !== 'habit' && row.position !== null)
      .map((row) => [row.id, row.position ?? 0]),
    ...order.notSaid
      .filter((row) => row.kind !== 'habit')
      .map((row) => [row.id, NOT_SAID_PLACE]),
    ...order.canWait
      .filter((row) => row.kind !== 'habit')
      .map((row, index) => [row.id, CAN_WAIT_PLACE + index]),
  ]);
