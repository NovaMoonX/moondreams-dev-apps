import {
  HELM_COPY,
  PROCEDURE_GROUP_NAME_CAP,
  PROCEDURE_GROUPS_MAX,
  PROCEDURE_STEP_DETAIL_CAP,
  PROCEDURE_STEP_TEXT_CAP,
  PROCEDURE_STEPS_MAX,
  PROCEDURE_TITLE_CAP,
} from '@apps/helm/constants';
import type { ProcedureSealed } from '@apps/helm/types';
import {
  flattenSteps,
  groupSteps,
  toStepState,
  type StepPlace,
} from '@apps/helm/utils/stepGroups';

export interface DraftStep {
  id: string;
  text: string;
  detail: string | null;
  groupId: string | null;
}

export interface DraftGroup {
  id: string;
  name: string;
}

/** A procedure as the form holds it: steps in one list, each naming its group; reading order is ungrouped first, then each group in turn. */
export interface ProcedureDraft {
  title: string;
  groups: DraftGroup[];
  steps: DraftStep[];
}

interface Source extends ProcedureSealed {
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
}

export const fromProcedure = (source: Source): ProcedureDraft => {
  const blocks = groupSteps(source, { keepEmpty: true });
  return {
    title: source.title,
    groups: blocks.flatMap((block) =>
      block.groupId === null || block.name === null
        ? []
        : [{ id: block.groupId, name: block.name }],
    ),
    steps: flattenSteps(blocks).map(({ id, text, detail, groupId }) => ({
      id,
      text,
      detail,
      groupId,
    })),
  };
};

const isInGroup = (
  draft: ProcedureDraft,
  step: DraftStep,
  id: string | null,
) =>
  id === null
    ? step.groupId === null || !draft.groups.some((g) => g.id === step.groupId)
    : step.groupId === id;

/** Every step in reading order. */
export const orderedSteps = (draft: ProcedureDraft): DraftStep[] => [
  ...draft.steps.filter((step) => isInGroup(draft, step, null)),
  ...draft.groups.flatMap((group) =>
    draft.steps.filter((step) => isInGroup(draft, step, group.id)),
  ),
];

export const isStepsFull = (draft: ProcedureDraft) =>
  draft.steps.length >= PROCEDURE_STEPS_MAX;

export const isGroupsFull = (draft: ProcedureDraft) =>
  draft.groups.length >= PROCEDURE_GROUPS_MAX;

/** Adds an empty step at the end of a group; at the cap the draft is returned as it was. */
export const addStep = (
  draft: ProcedureDraft,
  id: string,
  groupId: string | null,
): ProcedureDraft =>
  isStepsFull(draft)
    ? draft
    : {
        ...draft,
        steps: [...draft.steps, { id, text: '', detail: null, groupId }],
      };

export const addGroup = (
  draft: ProcedureDraft,
  id: string,
  name: string,
): ProcedureDraft =>
  isGroupsFull(draft)
    ? draft
    : { ...draft, groups: [...draft.groups, { id, name }] };

export const updateStep = (
  draft: ProcedureDraft,
  id: string,
  patch: Partial<Pick<DraftStep, 'text' | 'detail'>>,
): ProcedureDraft => ({
  ...draft,
  steps: draft.steps.map((step) =>
    step.id === id ? { ...step, ...patch } : step,
  ),
});

export const renameGroup = (
  draft: ProcedureDraft,
  id: string,
  name: string,
): ProcedureDraft => ({
  ...draft,
  groups: draft.groups.map((group) =>
    group.id === id ? { ...group, name } : group,
  ),
});

export const removeStep = (
  draft: ProcedureDraft,
  id: string,
): ProcedureDraft => ({
  ...draft,
  steps: draft.steps.filter((step) => step.id !== id),
});

/** A removed group keeps its steps, now ungrouped. */
export const removeGroup = (
  draft: ProcedureDraft,
  id: string,
): ProcedureDraft => ({
  ...draft,
  groups: draft.groups.filter((group) => group.id !== id),
  steps: draft.steps.map((step) =>
    step.groupId === id ? { ...step, groupId: null } : step,
  ),
});

/** Puts a removed group back at its place with the steps it held. */
export const restoreGroup = (
  draft: ProcedureDraft,
  group: DraftGroup,
  at: number,
  stepIds: string[],
): ProcedureDraft =>
  draft.groups.some((entry) => entry.id === group.id)
    ? draft
    : {
        ...draft,
        groups: [
          ...draft.groups.slice(0, at),
          group,
          ...draft.groups.slice(at),
        ],
        steps: draft.steps.map((step) =>
          stepIds.includes(step.id) ? { ...step, groupId: group.id } : step,
        ),
      };

/** A step moved into another group goes to the end of it. */
export const setStepGroup = (
  draft: ProcedureDraft,
  id: string,
  groupId: string | null,
): ProcedureDraft => {
  const step = draft.steps.find((entry) => entry.id === id);
  return step
    ? {
        ...draft,
        steps: [
          ...draft.steps.filter((entry) => entry.id !== id),
          { ...step, groupId },
        ],
      }
    : draft;
};

/** Swaps a step with its neighbour inside its own group; at an end the draft is returned as it was. */
export const moveStep = (
  draft: ProcedureDraft,
  id: string,
  direction: 'up' | 'down',
): ProcedureDraft => {
  const step = draft.steps.find((entry) => entry.id === id);
  if (!step) return draft;
  const group = draft.groups.some((entry) => entry.id === step.groupId)
    ? step.groupId
    : null;
  const mates = draft.steps.filter((entry) => isInGroup(draft, entry, group));
  const at = mates.findIndex((entry) => entry.id === id);
  const other = mates[at + (direction === 'up' ? -1 : 1)];
  if (!other) return draft;
  return {
    ...draft,
    steps: draft.steps.map((entry) =>
      entry.id === id ? other : entry.id === other.id ? step : entry,
    ),
  };
};

export const canMoveStep = (
  draft: ProcedureDraft,
  id: string,
  direction: 'up' | 'down',
) => moveStep(draft, id, direction) !== draft;

const cut = (text: string, cap: number) => text.trim().slice(0, cap);

/** What is saved: words trimmed and capped, empty steps and groups left out, steps in reading order. */
export function toContent(draft: ProcedureDraft): ProcedureDraft {
  const steps = orderedSteps(draft)
    .map((step) => ({
      ...step,
      text: cut(step.text, PROCEDURE_STEP_TEXT_CAP),
      detail: cut(step.detail ?? '', PROCEDURE_STEP_DETAIL_CAP) || null,
    }))
    .filter((step) => step.text !== '')
    .slice(0, PROCEDURE_STEPS_MAX);
  return {
    title: cut(draft.title, PROCEDURE_TITLE_CAP),
    groups: draft.groups
      .filter((group) => steps.some((step) => step.groupId === group.id))
      .slice(0, PROCEDURE_GROUPS_MAX)
      .map((group) => ({
        id: group.id,
        name:
          cut(group.name, PROCEDURE_GROUP_NAME_CAP) ||
          HELM_COPY.procedureGroupFallback,
      })),
    steps: steps.map((step) => ({
      ...step,
      groupId:
        step.groupId !== null && draft.groups.some((g) => g.id === step.groupId)
          ? step.groupId
          : null,
    })),
  };
}

/** The stored parts of saved content: placement, group order and the sealed words. */
export const toStoredParts = (content: ProcedureDraft) => ({
  stepState: toStepState(content.steps),
  groupOrder: content.groups.map((group) => group.id),
  body: {
    title: content.title,
    steps: Object.fromEntries(
      content.steps.map((step) => [
        step.id,
        { text: step.text, detail: step.detail },
      ]),
    ),
    groups: Object.fromEntries(
      content.groups.map((group) => [group.id, { name: group.name }]),
    ),
  } satisfies ProcedureSealed,
});

/** One line for History: what the person's save changed, at most three parts. */
export function summarizeEdit(
  before: ProcedureDraft,
  after: ProcedureDraft,
): string {
  const was = new Map(before.steps.map((step) => [step.id, step]));
  const is = new Map(after.steps.map((step) => [step.id, step]));
  const addedSteps = after.steps.filter((step) => !was.has(step.id));
  const removedSteps = before.steps.filter((step) => !is.has(step.id));
  const changedSteps = after.steps.filter((step) => {
    const earlier = was.get(step.id);
    return (
      earlier !== undefined &&
      (earlier.text !== step.text || earlier.detail !== step.detail)
    );
  });
  const namesOf = (steps: DraftStep[]) =>
    steps.map((step) => step.text.trim()).filter((text) => text !== '');
  const kept = (draft: ProcedureDraft) =>
    orderedSteps(draft)
      .filter((step) => was.has(step.id) && is.has(step.id))
      .map((step) => `${step.id}:${step.groupId ?? ''}`)
      .join(',');
  const isReordered = kept(before) !== kept(after);
  const groupsOf = (draft: ProcedureDraft) =>
    draft.groups.map((group) => `${group.id}:${group.name}`).join(',');
  const parts = [
    ...(before.title !== after.title
      ? [HELM_COPY.procedureSummaryRenamed]
      : []),
    ...(addedSteps.length > 0
      ? [
          HELM_COPY.procedureSummaryAdded(
            addedSteps.length,
            namesOf(addedSteps),
          ),
        ]
      : []),
    ...(removedSteps.length > 0
      ? [
          HELM_COPY.procedureSummaryRemoved(
            removedSteps.length,
            namesOf(removedSteps),
          ),
        ]
      : []),
    ...(changedSteps.length > 0
      ? [
          HELM_COPY.procedureSummaryChanged(
            changedSteps.length,
            namesOf(changedSteps),
          ),
        ]
      : []),
    ...(isReordered ? [HELM_COPY.procedureSummaryReordered] : []),
    ...(groupsOf(before) !== groupsOf(after) && !isReordered
      ? [HELM_COPY.procedureSummaryGroups]
      : []),
  ];
  return (
    parts.length === 0
      ? HELM_COPY.procedureSummaryNothing
      : parts.slice(0, 3).join(' · ')
  ).slice(0, 200);
}
