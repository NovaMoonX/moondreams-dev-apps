import { generateUuid } from '@/utils';
import { toComparable } from '@/utils/optionMatchUtils';
import type { OpenProcedure, OpenRun, RunStepPlace } from '@apps/helm/types';
import {
  groupSteps,
  type GroupedStep,
  type StepGroupBlock,
} from '@apps/helm/utils/stepGroups';

export type RunStep = GroupedStep & { doneAt: number | null };
export type RunBlock = Omit<StepGroupBlock, 'steps'> & { steps: RunStep[] };

type RunSteps = Pick<OpenRun, 'stepState' | 'groupOrder' | 'steps' | 'groups'>;

const isCounted =
  (run: RunSteps) =>
  ([id]: [string, RunStepPlace]) =>
    id in run.steps;

/** What a run shows: the procedure's steps in their groups, then the steps added for this run alone. */
export function getRunBlocks(run: RunSteps): {
  blocks: RunBlock[];
  extras: RunStep[];
} {
  const entries = Object.entries(run.stepState);
  const only = (isExtra: boolean) =>
    Object.fromEntries(
      entries.filter(([, place]) => place.isExtra === isExtra),
    );
  const withDone = (step: GroupedStep): RunStep => ({
    ...step,
    doneAt: run.stepState[step.id]?.doneAt ?? null,
  });
  return {
    blocks: groupSteps({ ...run, stepState: only(false) }).map((block) => ({
      ...block,
      steps: block.steps.map(withDone),
    })),
    extras: groupSteps({ ...run, stepState: only(true), groupOrder: [] })
      .flatMap((block) => block.steps)
      .map(withDone),
  };
}

export const getDoneCount = (steps: { doneAt: number | null }[]) =>
  steps.filter((step) => step.doneAt !== null).length;

/** How many of a run's steps are ticked, extras included. */
export function getRunProgress(run: RunSteps) {
  const counted = Object.entries(run.stepState).filter(isCounted(run));
  return {
    done: counted.filter(([, place]) => place.doneAt !== null).length,
    total: counted.length,
  };
}

/** The `stepState` fields that tick or untick these steps at once. */
export const toTickFields = (stepIds: string[], doneAt: number | null) =>
  Object.fromEntries(
    stepIds.map((id) => [`stepState.${id}.doneAt`, doneAt] as const),
  );

/** The run's state as the next extra step leaves it: a fresh id, ordered after every step, in no group. */
export const toExtraStep = (stepState: Record<string, RunStepPlace>) => ({
  id: generateUuid(),
  place: {
    order:
      Math.max(
        -1,
        ...Object.values(stepState)
          .map((place) => place.order)
          .filter(Number.isFinite),
      ) + 1,
    groupId: null,
    doneAt: null,
    isExtra: true,
  } satisfies RunStepPlace,
});

/** Whether the procedure already has a step with these words, so offering it again would only repeat it. */
export const hasStepWithText = (procedure: OpenProcedure, text: string) =>
  Object.values(procedure.steps).some(
    (step) => toComparable(step.text) === toComparable(text),
  );
