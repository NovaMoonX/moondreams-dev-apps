import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { AliasBook } from './aliases.js';
import {
  IMPORTANCE_RELATIONS,
  MAX_IMPORTANCE_PER_TURN,
  type CaptureReading,
  type SetImportanceCommand,
} from './commands.js';
import { IMPORTANCE_WORDS_CAP } from './importanceOrder.js';
import { sliceOfCapture } from './readHabitCommands.js';

export type ImportanceDrop =
  | 'importance-unknown'
  | 'importance-unasked'
  | 'importance-extra'
  | 'importance-shape';

export interface ImportanceReadContext {
  projects?: AliasBook;
  habits?: AliasBook;
  reading: CaptureReading;
  captureText?: string;
}

const NAME_CAP = 80;

const toUntil = (value: unknown, reading: CaptureReading) => {
  const span =
    typeof value === 'string'
      ? reading.dates.find((entry) => entry.id === value)
      : undefined;
  return span && !span.precision && span.due.kind === 'day'
    ? span.due.date
    : null;
};

/** Reads the reply's `setImportance` commands from their own list. The words kept are the person's own, cut from the capture; a quote the capture doesn't hold, or a name the context never listed, drops the command. */
export const readImportanceCommands = (
  items: Record<string, unknown>[],
  context: ImportanceReadContext,
): { commands: SetImportanceCommand[]; dropped: ImportanceDrop[] } => {
  const text = context.captureText ?? '';
  const idOf = (alias: unknown) =>
    typeof alias === 'string'
      ? (context.projects?.idOf(alias) ?? context.habits?.idOf(alias) ?? null)
      : null;
  return items
    .filter((item) => item.kind === 'setImportance')
    .reduce<{ commands: SetImportanceCommand[]; dropped: ImportanceDrop[] }>(
      (acc, item) => {
        const drop = (code: ImportanceDrop) => ({
          ...acc,
          dropped: [...acc.dropped, code],
        });
        const relation = IMPORTANCE_RELATIONS.find(
          (entry) => entry === item.importanceRelation,
        );
        if (!relation) return drop('importance-shape');
        const quote =
          typeof item.requestQuote === 'string' ? item.requestQuote : '';
        const words =
          toComparable(quote).split(' ').filter(Boolean).length >= 2
            ? sliceOfCapture(text, quote)
            : null;
        if (words === null) return drop('importance-unasked');
        if (acc.commands.length >= MAX_IMPORTANCE_PER_TURN)
          return drop('importance-extra');
        const subjectId = idOf(item.subjectAlias);
        const name =
          typeof item.subjectName === 'string'
            ? item.subjectName.replace(/\s+/g, ' ').trim().slice(0, NAME_CAP)
            : '';
        if (subjectId === null && (name === '' || relation === 'clear'))
          return drop('importance-unknown');
        const otherId = idOf(item.otherAlias);
        const needsOther =
          relation === 'above' || relation === 'below' || relation === 'same';
        if (needsOther && (otherId === null || otherId === subjectId))
          return drop('importance-unknown');
        return {
          ...acc,
          commands: [
            ...acc.commands,
            {
              kind: 'setImportance',
              subjectId,
              unknownName: subjectId === null ? name : null,
              relation,
              otherId: needsOther ? otherId : null,
              words: words.slice(0, IMPORTANCE_WORDS_CAP),
              until: toUntil(item.dateSpanId, context.reading),
            },
          ],
        };
      },
      { commands: [], dropped: [] },
    );
};
