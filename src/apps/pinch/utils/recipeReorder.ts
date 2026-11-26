import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';
import { groupStepSections } from '@apps/pinch/utils/stepSections';

export interface StepList {
  steps: string[];
  sections: (string | null)[];
}

/** Where an item lands: a group index from before the move, and a place counted after the item has left its old spot. */
export interface ReorderSlot {
  group: number;
  index: number;
}

export type MoveDirection = -1 | 1;

const insertAt = <T>(list: T[], index: number, item: T) => [
  ...list.slice(0, index),
  item,
  ...list.slice(index),
];

const moveWithin = <T>(list: T[], from: number, to: number) => {
  const item = list[from];
  return insertAt(
    list.filter((_, at) => at !== from),
    Math.max(0, Math.min(to, list.length - 1)),
    item,
  );
};

const flattenBlocks = (
  blocks: { name: string | null; steps: { text: string }[] }[],
): StepList => ({
  steps: blocks.flatMap((block) => block.steps.map((step) => step.text)),
  sections: blocks.flatMap((block) => block.steps.map(() => block.name)),
});

const getStepBlocks = ({ steps, sections }: StepList) =>
  groupStepSections(steps, sections);

/** Finds a step's run and its place in it. */
export const findStepSlot = (list: StepList, index: number): ReorderSlot => {
  const blocks = getStepBlocks(list);
  const group = blocks.findIndex((block) =>
    block.steps.some((step) => step.index === index),
  );
  const result = {
    group,
    index: blocks[group]?.steps.findIndex((step) => step.index === index) ?? -1,
  };
  return result;
};

/** Moves one step into a run at a place, taking that run's section; a run left empty disappears. Returns the new lists and the step's new index. */
export const moveStep = (
  list: StepList,
  from: number,
  to: ReorderSlot,
): StepList & { index: number } => {
  const blocks = getStepBlocks(list);
  const target = blocks[to.group];
  if (!target || from < 0 || from >= list.steps.length)
    return { ...list, index: from };
  const moving = { text: list.steps[from], index: from };
  const without = blocks.map((block) => ({
    ...block,
    steps: block.steps.filter((step) => step.index !== from),
  }));
  const placed = without.map((block, at) =>
    at === to.group
      ? {
          ...block,
          steps: insertAt(
            block.steps,
            Math.max(0, Math.min(to.index, block.steps.length)),
            moving,
          ),
        }
      : block,
  );
  const flat = flattenBlocks(placed);
  const index = placed
    .flatMap((block) => block.steps)
    .findIndex((step) => step === moving);
  return { ...flat, index };
};

/** Moves a whole run of steps to a place among the runs; a leading run with no section stays first. */
export const moveStepSection = (
  list: StepList,
  from: number,
  to: number,
): StepList => {
  const blocks = getStepBlocks(list);
  const pinned = blocks[0]?.name === null ? 1 : 0;
  if (from < pinned || from >= blocks.length) return list;
  const result = flattenBlocks(moveWithin(blocks, from, Math.max(pinned, to)));
  return result;
};

/** The slot one step up or down from a step: within its run, then across the heading into the end of the run before or the start of the run after; null at either end. */
export const getStepNeighbourSlot = (
  list: StepList,
  index: number,
  direction: MoveDirection,
): ReorderSlot | null => {
  const blocks = getStepBlocks(list);
  const { group, index: place } = findStepSlot(list, index);
  const block = blocks[group];
  if (!block) return null;
  const isAtEdge =
    direction === -1 ? place === 0 : place === block.steps.length - 1;
  if (!isAtEdge) return { group, index: place + direction };
  const next = blocks[group + direction];
  if (!next) return null;
  const result =
    direction === -1
      ? { group: group - 1, index: next.steps.length }
      : { group: group + 1, index: 0 };
  return result;
};

/** Whether a run can move one place up or down among the runs: a leading run with no section never moves and is never passed. */
export const canMoveStepSection = (
  list: StepList,
  group: number,
  direction: MoveDirection,
) => {
  const blocks = getStepBlocks(list);
  const pinned = blocks[0]?.name === null ? 1 : 0;
  const to = group + direction;
  return group >= pinned && to >= pinned && to < blocks.length;
};

interface MovableLine {
  id: string;
  group: string | null;
}

const flattenGroups = <T extends MovableLine>(
  groups: { name: string | null; lines: T[] }[],
) =>
  groups.flatMap((group) =>
    group.lines.map((line) =>
      line.group === group.name ? line : { ...line, group: group.name },
    ),
  );

/** Finds a line's group and its place in it, in the order the grouped list draws them. */
export const findLineSlot = <T extends MovableLine>(
  lines: T[],
  lineId: string,
): ReorderSlot => {
  const groups = groupIngredientLines(lines);
  const group = groups.findIndex((entry) =>
    entry.lines.some((line) => line.id === lineId),
  );
  const result = {
    group,
    index: groups[group]?.lines.findIndex((line) => line.id === lineId) ?? -1,
  };
  return result;
};

/** Moves one ingredient line into a group at a place, taking that group's name; lines are stored in the order they show. */
export const moveIngredientLine = <T extends MovableLine>(
  lines: T[],
  lineId: string,
  to: ReorderSlot,
): T[] => {
  const groups = groupIngredientLines(lines);
  const moving = lines.find((line) => line.id === lineId);
  const target = groups[to.group];
  if (!moving || !target) return lines;
  const without = groups.map((group) => ({
    ...group,
    lines: group.lines.filter((line) => line.id !== lineId),
  }));
  const placed = without.map((group, at) =>
    at === to.group
      ? {
          ...group,
          lines: insertAt(
            group.lines,
            Math.max(0, Math.min(to.index, group.lines.length)),
            moving,
          ),
        }
      : group,
  );
  return flattenGroups(placed);
};

/** Moves a whole ingredient group to a place among the groups; the lines with no group always stay first. */
export const moveIngredientGroup = <T extends MovableLine>(
  lines: T[],
  from: number,
  to: number,
): T[] => {
  const groups = groupIngredientLines(lines);
  const pinned = groups[0]?.name === null ? 1 : 0;
  if (from < pinned || from >= groups.length) return lines;
  return flattenGroups(moveWithin(groups, from, Math.max(pinned, to)));
};

/** The slot one line up or down from a line, crossing into the neighbouring group at an edge; null at either end. */
export const getLineNeighbourSlot = <T extends MovableLine>(
  lines: T[],
  lineId: string,
  direction: MoveDirection,
): ReorderSlot | null => {
  const groups = groupIngredientLines(lines);
  const { group, index } = findLineSlot(lines, lineId);
  const current = groups[group];
  if (!current) return null;
  const isAtEdge =
    direction === -1 ? index === 0 : index === current.lines.length - 1;
  if (!isAtEdge) return { group, index: index + direction };
  const next = groups[group + direction];
  if (!next) return null;
  const result =
    direction === -1
      ? { group: group - 1, index: next.lines.length }
      : { group: group + 1, index: 0 };
  return result;
};

/** Whether an ingredient group can move one place up or down; the lines with no group never move and are never passed. */
export const canMoveIngredientGroup = <T extends MovableLine>(
  lines: T[],
  group: number,
  direction: MoveDirection,
) => {
  const groups = groupIngredientLines(lines);
  const pinned = groups[0]?.name === null ? 1 : 0;
  const to = group + direction;
  return group >= pinned && to >= pinned && to < groups.length;
};

/** Where a moved run of items sat, by the ids around it, so an Undo reverses only that move on whatever the list has become. */
export interface SpanAnchor {
  ids: string[];
  before: string | null;
  after: string | null;
  index: number;
}

export const getSpanAnchor = (ids: string[], spanIds: string[]): SpanAnchor => {
  const places = spanIds.map((id) => ids.indexOf(id)).filter((at) => at >= 0);
  const first = Math.min(...places);
  const last = Math.max(...places);
  return {
    ids: spanIds,
    before: ids[first - 1] ?? null,
    after: ids[last + 1] ?? null,
    index: first,
  };
};

/** The ids with the anchor's run put back before the id that followed it, else after the one that preceded it, else at its old index; null when none of the run is left. */
export const restoreSpanOrder = (
  ids: string[],
  anchor: SpanAnchor,
): string[] | null => {
  const present = anchor.ids.filter((id) => ids.includes(id));
  if (present.length === 0) return null;
  const rest = ids.filter((id) => !present.includes(id));
  const afterAt = rest.indexOf(anchor.after ?? '');
  const beforeAt = rest.indexOf(anchor.before ?? '');
  const at =
    afterAt >= 0
      ? afterAt
      : beforeAt >= 0
        ? beforeAt + 1
        : Math.min(anchor.index, rest.length);
  return [...rest.slice(0, at), ...present, ...rest.slice(at)];
};
