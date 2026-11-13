export type StepPlace = { order: number; groupId: string | null };
export type StepBody = { text: string; detail: string | null };
export type GroupedStep = {
  id: string;
  text: string;
  detail: string | null;
  order: number;
};
export type StepGroupBlock = {
  groupId: string | null;
  name: string | null;
  steps: GroupedStep[];
};

type StepSource = {
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
  steps: Record<string, StepBody>;
  groups: Record<string, { name: string }>;
};

const byOrder = (a: GroupedStep, b: GroupedStep) =>
  a.order - b.order || a.id.localeCompare(b.id);

/** Ordered steps in their named groups, ungrouped first; an unknown group's steps join the ungrouped block. */
export function groupSteps(
  { stepState, groupOrder, steps, groups }: StepSource,
  { keepEmpty = false }: { keepEmpty?: boolean } = {},
): StepGroupBlock[] {
  const knownGroups = groupOrder.filter(
    (id, index) => id in groups && groupOrder.indexOf(id) === index,
  );
  const placed = Object.entries(stepState)
    .filter(([id, place]) => id in steps && Number.isFinite(place.order))
    .map(([id, place]) => ({
      groupId:
        place.groupId !== null && knownGroups.includes(place.groupId)
          ? place.groupId
          : null,
      step: {
        id,
        text: steps[id].text,
        detail: steps[id].detail,
        order: place.order,
      },
    }));
  const stepsOf = (groupId: string | null) =>
    placed
      .filter((entry) => entry.groupId === groupId)
      .map((entry) => entry.step)
      .sort(byOrder);
  const blocks: StepGroupBlock[] = [
    { groupId: null, name: null, steps: stepsOf(null) },
    ...knownGroups.map((id) => ({
      groupId: id,
      name: groups[id].name,
      steps: stepsOf(id),
    })),
  ];
  return keepEmpty ? blocks : blocks.filter((block) => block.steps.length > 0);
}

/** Every step in reading order across its groups. */
export const flattenSteps = (blocks: StepGroupBlock[]) =>
  blocks.flatMap((block) =>
    block.steps.map((step) => ({ ...step, groupId: block.groupId })),
  );

/** A step state numbered 0..n-1 in the order given. */
export const toStepState = (
  list: { id: string; groupId: string | null }[],
): Record<string, StepPlace> =>
  Object.fromEntries(
    list.map((step, index) => [
      step.id,
      { order: index, groupId: step.groupId },
    ]),
  );

export const countSteps = (blocks: StepGroupBlock[]) =>
  blocks.reduce((total, block) => total + block.steps.length, 0);
