import type { Cents, DateOnly } from '@apps/runway/types';

export interface GoalSeriesPoint {
  x: DateOnly;
  /** What the goal held; null for a day only the projection covers. */
  y: Cents | null;
  /** What the plan has it holding; set from today on. */
  y2?: Cents | null;
}

interface GoalSeriesInput {
  heldCents: Cents;
  targetCents: Cents;
  targetDate: DateOnly | null;
  startDate: DateOnly | null;
  /** What confirmed days put into the goal, by the day the money arrived. */
  splits: readonly { on: DateOnly; cents: Cents }[];
  /** What the plan puts in on each coming income day. */
  contributions: readonly { on: DateOnly; cents: Cents }[];
  today: DateOnly;
}

const byDay = (parts: readonly { on: DateOnly; cents: Cents }[]) =>
  [...parts]
    .sort((a, b) => a.on - b.on)
    .reduce<{ on: DateOnly; cents: Cents }[]>((days, part) => {
      const last = days.at(-1);
      return last && last.on === part.on
        ? [
            ...days.slice(0, -1),
            { on: part.on, cents: last.cents + part.cents },
          ]
        : [...days, { ...part }];
    }, []);

/** What a goal held over time and where the plan takes it; the first point carries whatever was held before the days that are read. */
export function getGoalSeries(input: GoalSeriesInput) {
  const { heldCents, targetCents, targetDate, today } = input;
  const past = byDay(input.splits.filter((part) => part.on <= today));
  const carried = heldCents - past.reduce((sum, part) => sum + part.cents, 0);
  const firstOn = Math.min(
    input.startDate ?? today,
    past[0]?.on ?? today,
    today,
  );
  const running = past.reduce<{ total: Cents; points: GoalSeriesPoint[] }>(
    (acc, part) => {
      const total = acc.total + part.cents;
      return { total, points: [...acc.points, { x: part.on, y: total }] };
    },
    { total: carried, points: [{ x: firstOn, y: carried }] },
  );
  const history = [
    ...new Map(running.points.map((point) => [point.x, point])).values(),
  ];
  const withToday =
    history.at(-1)?.x === today
      ? history
      : [...history, { x: today, y: heldCents }];

  const ahead = byDay(
    input.contributions.filter(
      (part) =>
        heldCents < targetCents &&
        part.on > today &&
        part.cents > 0 &&
        (targetDate === null || part.on <= targetDate),
    ),
  );
  const projected = ahead.reduce<{ total: Cents; points: GoalSeriesPoint[] }>(
    (acc, part) => {
      const total = acc.total + part.cents;
      return {
        total,
        points: [...acc.points, { x: part.on, y: null, y2: total }],
      };
    },
    { total: heldCents, points: [] },
  );
  const reachedOn =
    heldCents >= targetCents
      ? null
      : (projected.points.find((point) => (point.y2 ?? 0) >= targetCents)?.x ??
        null);
  const tail =
    ahead.length > 0 && targetDate !== null && targetDate > ahead.at(-1)!.on
      ? [{ x: targetDate, y: null, y2: projected.total }]
      : [];
  const points: GoalSeriesPoint[] =
    ahead.length === 0
      ? withToday
      : [
          ...withToday.slice(0, -1),
          { ...withToday.at(-1)!, y2: heldCents },
          ...projected.points,
          ...tail,
        ];
  const result = {
    points,
    reachedOn,
    hasChart: points.length >= 2,
    hasProjection: ahead.length > 0,
  };
  return result;
}
