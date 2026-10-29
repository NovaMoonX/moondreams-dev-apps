import {
  PRIORITIES,
  PRIORITIES_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type { PriorityAssignment } from '@apps/runway/engine/priorities';
import type { PreviewDay } from '@apps/runway/store/selectors/previewSelectors';
import type { Priority } from '@apps/runway/types';

type Tiers = Readonly<Record<Priority, readonly string[]>>;

/** The change-log line for a saved order and the confirm step's subtitle: up to three moved items, each with where it went (and how many others it jumped), then a count of the rest. */
export function describeReorder(
  assignments: readonly PriorityAssignment[],
  moved: ReadonlySet<string>,
  working: Tiers,
  originalTiers: ReadonlyMap<string, Priority>,
  nameOf: (itemId: string) => string,
  originalLists: Tiers,
) {
  const placed = assignments.filter((entry) => moved.has(entry.itemId));
  const describeOne = ({ itemId, tier }: PriorityAssignment) => {
    const name = nameOf(itemId);
    if (originalTiers.get(itemId) !== tier) {
      return `${name} to ${PRIORITY_LABELS[tier]}`;
    }
    const list = working[tier];
    const index = list.indexOf(itemId);
    const from = originalLists[tier].indexOf(itemId);
    const jumped = Math.abs(index - from);
    const others =
      jumped > 1 ? ` and ${jumped - 1} other${jumped > 2 ? 's' : ''}` : '';
    if (index < list.length - 1 && index <= from)
      return `${name} above ${nameOf(list[index + 1])}${others}`;
    return index > 0
      ? `${name} below ${nameOf(list[index - 1])}${others}`
      : name;
  };
  const shown = placed.slice(0, 3).map(describeOne);
  const rest = placed.length - shown.length;
  if (shown.length === 0) return 'Moved items';
  if (rest > 0) return `Moved ${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return `Moved ${shown[0]}`;
  return `Moved ${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

/** The toast after a saved order: where the one moved item now sits, or a plain line when several moved. */
export function describeSaved(
  moved: ReadonlySet<string>,
  working: Tiers,
  originalTiers: ReadonlyMap<string, Priority>,
  nameOf: (itemId: string) => string,
) {
  const [only] = [...moved];
  if (moved.size !== 1) return PRIORITIES_WORDS.savedMany;
  const tier = PRIORITIES.find((key) => working[key].includes(only));
  if (tier === undefined) return PRIORITIES_WORDS.savedMany;
  const name = nameOf(only);
  const list = working[tier];
  const index = list.indexOf(only);
  if (originalTiers.get(only) !== tier)
    return PRIORITIES_WORDS.nowIn(name, PRIORITY_LABELS[tier]);
  if (index < list.length - 1)
    return PRIORITIES_WORDS.nowBefore(name, nameOf(list[index + 1]));
  return index > 0
    ? PRIORITIES_WORDS.nowAfter(name, nameOf(list[index - 1]))
    : PRIORITIES_WORDS.savedMany;
}

interface MoveReading {
  /** What the moved item gains, said first. */
  gain: string | null;
  /** What the move takes, and from whom. */
  takes: string | null;
  /** How many more items get less than the one named. */
  moreTaken: number;
  /** The soonest pay, when the move leaves it as it was. */
  soonestSame: string | null;
}

const toDates = (days: readonly number[]) => {
  const ons = [...new Set(days)];
  const firstYear = new Date(ons[0]).getUTCFullYear();
  return ons
    .map((on) => {
      const text = formatDateShortUTC(on);
      const year = new Date(on).getUTCFullYear();
      return year !== firstYear && !text.includes(String(year))
        ? `${text}, ${year}`
        : text;
    })
    .reduce(
      (text, part, index, all) =>
        index === 0
          ? part
          : index === all.length - 1
            ? `${text} and ${part}`
            : `${text}, ${part}`,
      '',
    );
};

/** The confirm step's reading of a move: what the moved items gain, what it takes from whom (no figures while amounts are hidden), and whether the soonest pay stays as it was. */
export function readMove(
  days: readonly PreviewDay[],
  moved: ReadonlySet<string>,
  comingOn: readonly number[],
  isHidden: boolean,
): MoveReading {
  const perItem = days
    .flatMap((day) =>
      day.kind !== 'changed'
        ? []
        : day.effect.lines.map((line) => ({
            ...line,
            on: day.on,
            name: day.names[line.itemId]?.name ?? 'An item',
          })),
    )
    .reduce((acc, line) => {
      const list = acc.get(line.itemId) ?? [];
      return acc.set(line.itemId, [...list, line]);
    }, new Map<string, { on: number; name: string; beforeCents: number; afterCents: number }[]>());
  const entries = [...perItem.entries()].map(([itemId, lines]) => ({
    itemId,
    name: lines[0].name,
    lines,
    gained: lines.reduce(
      (sum, line) => sum + Math.max(0, line.afterCents - line.beforeCents),
      0,
    ),
    lost: lines.reduce(
      (sum, line) => sum + Math.max(0, line.beforeCents - line.afterCents),
      0,
    ),
  }));
  const when = (lines: readonly { on: number }[]) => {
    const ons = lines.map((line) => line.on);
    if (ons.every((on, index) => on === comingOn[index]))
      return PRIORITIES_WORDS.nextPays(ons.length);
    return ons.length > 4
      ? PRIORITIES_WORDS.somePays(ons.length)
      : toDates(ons);
  };
  const figureOf = (cents: readonly number[]) =>
    isHidden || cents.some((value) => value !== cents[0])
      ? null
      : formatCents(cents[0]);
  const mover = entries
    .filter((entry) => moved.has(entry.itemId) && entry.gained > 0)
    .sort((a, b) => b.gained - a.gained)[0];
  const losers = entries
    .filter((entry) => entry.lost > 0)
    .sort((a, b) => b.lost - a.lost);
  const loser = losers[0];
  const gains = mover?.lines.filter(
    (line) => line.afterCents > line.beforeCents,
  );
  const cuts = loser?.lines.filter(
    (line) => line.afterCents < line.beforeCents,
  );
  const affected = new Set(days.map((day) => day.on));
  return {
    gain:
      mover === undefined || gains === undefined
        ? null
        : PRIORITIES_WORDS.gainsMore(
            mover.name,
            figureOf(gains.map((line) => line.afterCents - line.beforeCents)),
            when(gains),
          ),
    takes:
      loser === undefined || cuts === undefined
        ? null
        : PRIORITIES_WORDS.getsFigure(
            loser.name,
            figureOf(cuts.map((line) => line.afterCents)),
            when(cuts),
          ),
    moreTaken: Math.max(0, losers.length - 1),
    soonestSame:
      comingOn.length > 0 && !affected.has(comingOn[0])
        ? PRIORITIES_WORDS.soonestSame(formatDateShortUTC(comingOn[0]))
        : null,
  };
}
