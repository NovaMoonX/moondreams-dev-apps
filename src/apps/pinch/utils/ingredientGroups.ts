import { MAX_INGREDIENT_GROUP_LENGTH } from '@apps/pinch/constants';

/** A line as grouping sees it: `group` is missing on lines written before groups, which reads as none. */
interface GroupedLine {
  group?: string | null;
}

interface MovableLine {
  id: string;
  group: string | null;
}

export interface LineGroup<T> {
  /** One group's identity: its name ignoring case and spacing, `''` for the lines with no group. */
  key: string;
  /** The name as its first line spells it; null for the lines with no group. */
  name: string | null;
  lines: T[];
}

/** A group name as it is stored: inner spaces collapsed, trimmed and capped; a blank one is no group. */
export const cleanGroupName = (text: string | null | undefined) => {
  const cleaned = (text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_INGREDIENT_GROUP_LENGTH)
    .trim();
  const result = cleaned === '' ? null : cleaned;
  return result;
};

export const getGroupKey = (group: string | null | undefined) =>
  cleanGroupName(group)?.toLowerCase() ?? '';

/**
 * A recipe's lines under their headings: the lines with no group first, with no heading (below a group they would read as part of it), then each group in the order its first line appears.
 * Two spellings of one name are one group.
 */
export function groupIngredientLines<T extends GroupedLine>(
  lines: T[],
): LineGroup<T>[] {
  const byKey = lines.reduce((acc, line) => {
    const key = getGroupKey(line.group);
    const known = acc.get(key);
    return acc.set(
      key,
      known
        ? { ...known, lines: [...known.lines, line] }
        : {
            key,
            name: key === '' ? null : cleanGroupName(line.group),
            lines: [line],
          },
    );
  }, new Map<string, LineGroup<T>>());
  const groups = [...byKey.values()];
  const result = [
    ...groups.filter((group) => group.name === null),
    ...groups.filter((group) => group.name !== null),
  ];

  return result;
}

/** The lines in the order the grouped list shows them. */
export const orderIngredientLines = <T extends GroupedLine>(lines: T[]) =>
  groupIngredientLines(lines).flatMap((group) => group.lines);

/** Each group's name once, in the order the groups show. */
export const getGroupNames = (lines: GroupedLine[]) =>
  groupIngredientLines(lines).flatMap((group) =>
    group.name === null ? [] : [group.name],
  );

/** For a line shown away from its heading (a step, a change note), the group that tells it apart, spelled as its heading: set only when its ingredient has lines in more than one group. */
export function getRepeatedLineGroups(
  lines: (GroupedLine & { id: string; ingredientId: string })[],
): Map<string, string> {
  const groups = groupIngredientLines(lines);
  const groupCounts = groups
    .flatMap((group) => [
      ...new Set(group.lines.map((line) => line.ingredientId)),
    ])
    .reduce(
      (acc, ingredientId) =>
        acc.set(ingredientId, (acc.get(ingredientId) ?? 0) + 1),
      new Map<string, number>(),
    );
  const result = new Map(
    groups.flatMap((group) => {
      const { name } = group;
      if (name === null) return [];
      return group.lines
        .filter((line) => (groupCounts.get(line.ingredientId) ?? 0) > 1)
        .map((line) => [line.id, name] as const);
    }),
  );

  return result;
}

/** The spelling a typed group name is stored with: an existing group's when it matches one ignoring case, else the cleaned text. */
export const resolveGroupName = (
  typed: string | null | undefined,
  lines: GroupedLine[],
) => {
  const key = getGroupKey(typed);
  if (key === '') return null;
  const existing = getGroupNames(lines).find(
    (name) => getGroupKey(name) === key,
  );
  const result = existing ?? cleanGroupName(typed);
  return result;
};

/** Puts a line (moved or new) at the end of its group, so a group never jumps: a new group goes last, and no group joins the ungrouped lines at the top. The result is in display order. */
export function placeLineInGroup<T extends MovableLine>(
  lines: T[],
  line: T,
): T[] {
  const ordered = orderIngredientLines(
    lines.filter((candidate) => candidate.id !== line.id),
  );
  const key = getGroupKey(line.group);
  const lastIndex = ordered.reduce(
    (found, candidate, index) =>
      getGroupKey(candidate.group) === key ? index : found,
    -1,
  );
  const insertAt =
    lastIndex >= 0 ? lastIndex + 1 : key === '' ? 0 : ordered.length;
  const result = [
    ...ordered.slice(0, insertAt),
    line,
    ...ordered.slice(insertAt),
  ];

  return result;
}

/** Renames a group on every line that carries it; a name another group already has makes them one group, keeping that group's spelling. */
export function renameLineGroup<T extends MovableLine>(
  lines: T[],
  from: string,
  to: string,
): T[] {
  const fromKey = getGroupKey(from);
  const toKey = getGroupKey(to);
  const name =
    toKey === fromKey ? cleanGroupName(to) : resolveGroupName(to, lines);
  if (name === null || fromKey === '') return lines;
  const result = orderIngredientLines(
    lines.map((line) => {
      const key = getGroupKey(line.group);
      return key === fromKey || key === toKey ? { ...line, group: name } : line;
    }),
  );

  return result;
}

/** Takes a group away and keeps its lines, which join the ones with no group. */
export const ungroupLines = <T extends MovableLine>(
  lines: T[],
  group: string,
) =>
  orderIngredientLines(
    lines.map((line) =>
      getGroupKey(line.group) === getGroupKey(group)
        ? { ...line, group: null }
        : line,
    ),
  );

/** Undoes removing a group, on the lines as they are now: the group's lines that are still there get it back, in the order they had, and edits made since stay. */
export function restoreLineGroup<T extends MovableLine>(
  current: T[],
  before: T[],
  group: string,
): T[] {
  const key = getGroupKey(group);
  const currentById = new Map(current.map((line) => [line.id, line]));
  const beforeIds = new Set(before.map((line) => line.id));
  const kept = before.flatMap((line) => {
    const now = currentById.get(line.id);
    if (!now) return [];
    return [
      getGroupKey(line.group) === key && now.group === null
        ? { ...now, group: line.group }
        : now,
    ];
  });
  const result = orderIngredientLines([
    ...kept,
    ...current.filter((line) => !beforeIds.has(line.id)),
  ]);

  return result;
}
