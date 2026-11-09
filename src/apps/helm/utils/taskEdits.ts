import { generateUuid } from '@/utils';
import type {
  OpenTask,
  Task,
  TaskSealed,
  TaskWordsChange,
} from '@apps/helm/types';

/** Applies one change to words just re-read from the server, so what another device changed meanwhile is kept. */
export function applyWordsChange(
  opened: TaskSealed,
  change: TaskWordsChange,
): TaskSealed {
  switch (change.kind) {
    case 'title':
      return { ...opened, title: change.title };
    case 'notes':
      return { ...opened, notes: change.notes };
    case 'addStep':
    case 'editStep':
      return {
        ...opened,
        steps: { ...opened.steps, [change.stepId]: { text: change.text } },
      };
    case 'removeStep':
      return {
        ...opened,
        steps: Object.fromEntries(
          Object.entries(opened.steps).filter(([id]) => id !== change.stepId),
        ),
      };
  }
}

export const nextStepOrder = (stepState: Task['stepState']) =>
  Math.max(-1, ...Object.values(stepState).map((step) => step.order)) + 1;

/** Steps in the person's order; an id missing from either the words or the state is skipped. */
export const getOrderedSteps = (task: Pick<OpenTask, 'steps' | 'stepState'>) =>
  Object.entries(task.stepState)
    .filter(([id]) => id in task.steps)
    .map(([id, state]) => ({
      id,
      text: task.steps[id].text,
      order: state.order,
      doneAt: state.doneAt,
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

/** The orders that swap a step with its neighbour, or null at an end. */
export function getSwapOrders(
  steps: ReturnType<typeof getOrderedSteps>,
  stepId: string,
  direction: 'up' | 'down',
): Record<string, number> | null {
  const index = steps.findIndex((step) => step.id === stepId);
  const other = steps[index + (direction === 'up' ? -1 : 1)];
  if (index < 0 || !other) return null;
  return {
    [stepId]: other.order,
    [other.id]: steps[index].order,
  };
}

export const newStepId = () => generateUuid().replaceAll('-', '').slice(0, 12);
