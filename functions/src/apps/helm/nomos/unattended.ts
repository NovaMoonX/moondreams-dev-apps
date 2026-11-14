import type { ContextTask } from './buildContext.js';
import type { TaskDue } from './commands.js';
import { readMaskedLabel } from '../privacy.js';

/** The name each private thing is called by while the turn is unattended; the same words mask the reply. */
export interface MaskedName {
  name: string;
  label: string;
}

const WINDOW_AFTERNOON_FROM = 12;
const WINDOW_EVENING_FROM = 17;

/** A task as the model sees it: its words, or, on an unattended turn, only a label built from its time of day, never its name. */
export const toContextTask = (
  id: string,
  task: { privacy?: string | null; due: TaskDue | null },
  words: { title: string; sealed: Record<string, unknown> },
  mask: { isOn: boolean; timeZone: string; names: MaskedName[] },
): ContextTask => {
  if (!mask.isOn || task.privacy !== 'private') {
    return { id, title: words.title, due: task.due };
  }
  const at = task.due?.kind === 'moment' ? new Date(task.due.at) : null;
  const hour = at
    ? Number(
        new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: mask.timeZone,
        }).format(at),
      )
    : null;
  const label = readMaskedLabel({
    mark: words.sealed.privateMark === 'health' ? 'health' : null,
    windowLabel:
      hour === null
        ? null
        : hour < WINDOW_AFTERNOON_FROM
          ? 'morning'
          : hour < WINDOW_EVENING_FROM
            ? 'afternoon'
            : 'evening',
    timeLabel: at
      ? new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: mask.timeZone,
        }).format(at)
      : null,
  });
  mask.names.push({ name: words.title, label });
  return { id, title: label, due: task.due };
};
