import type { ContextInput, ContextTask } from './buildContext.js';
import type { SyncedCopy } from '../syncedCopies.js';
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

type Mask = { isOn: boolean; names: MaskedName[]; quoted?: MaskedName[] };

const cover = (
  mask: Mask,
  isPrivate: boolean | undefined,
  label: string,
  words: (string | null | undefined)[],
) => {
  if (isPrivate !== true) return false;
  words.forEach((word) => {
    if (!word) return;
    mask.quoted?.push({ name: word, label });
    if (mask.isOn) mask.names.push({ name: word, label });
  });
  return mask.isOn;
};

/** Every private record that would reach the model on an unattended turn, replaced by a label made by code; the words it covers join the names the reply is masked with. */
export const maskContextRecords = (
  mask: Mask,
  input: Pick<
    ContextInput,
    | 'facts'
    | 'selfFacts'
    | 'keyDates'
    | 'upcoming'
    | 'projects'
    | 'topics'
    | 'notes'
    | 'procedures'
    | 'focusedProcedure'
    | 'focusedTopic'
    | 'runs'
  > & { synced: SyncedCopy[] },
) => ({
  facts: input.facts?.map((fact) =>
    cover(mask, fact.isSubjectPrivate, 'a private person', [fact.subject]) ||
    cover(mask, fact.isPrivate, 'a private fact', [fact.statement])
      ? {
          ...fact,
          subject: fact.isSubjectPrivate ? 'a private person' : fact.subject,
          statement: fact.isPrivate ? 'a private fact' : fact.statement,
        }
      : fact,
  ),
  selfFacts: input.selfFacts?.map((fact) =>
    cover(mask, fact.isPrivate, 'a private fact', [fact.statement, fact.value])
      ? { ...fact, topic: null, value: null, statement: 'a private fact' }
      : fact,
  ),
  keyDates: input.keyDates?.map((date) =>
    cover(mask, date.isPrivate, 'a private person', [date.who, date.label])
      ? {
          ...date,
          who: 'a private person',
          kind: 'date',
          label: null,
          when: 'a private date',
        }
      : date,
  ),
  upcoming: input.upcoming?.map((date) =>
    cover(mask, date.isPrivate, 'a private person', [date.who])
      ? { ...date, who: 'a private person', what: 'date' }
      : date,
  ),
  projects: input.projects?.map((project) =>
    cover(mask, project.isPrivate, 'a private project', [
      project.name,
      ...project.milestones.map((milestone) => milestone.title),
    ])
      ? { ...project, name: 'a private project', milestones: [] }
      : project,
  ),
  topics: input.topics?.map((topic) =>
    cover(mask, topic.isPrivate, 'a private topic', [topic.name])
      ? { ...topic, name: 'a private topic', path: 'a private topic' }
      : topic,
  ),
  notes: input.notes?.map((note) =>
    cover(mask, note.isPrivate, 'a private note', [note.title, note.body])
      ? { id: note.id, title: 'a private note', isPrivate: true }
      : note,
  ),
  procedures: input.procedures?.map((procedure) =>
    cover(mask, procedure.isPrivate, 'a private procedure', [procedure.title])
      ? { ...procedure, title: 'a private procedure' }
      : procedure,
  ),
  focusedProcedure:
    input.focusedProcedure &&
    cover(mask, input.focusedProcedure.isPrivate, 'a private procedure', [
      input.focusedProcedure.title,
      ...input.focusedProcedure.blocks.flatMap((block) =>
        block.steps.map((step) => step.text),
      ),
    ])
      ? {
          ...input.focusedProcedure,
          title: 'a private procedure',
          blocks: [],
        }
      : input.focusedProcedure,
  focusedTopic:
    input.focusedTopic &&
    cover(
      mask,
      (input.focusedTopic as { isPrivate?: boolean }).isPrivate,
      'a private topic',
      [input.focusedTopic.name],
    )
      ? { ...input.focusedTopic, name: 'a private topic', sections: [] }
      : input.focusedTopic,
  runs: input.runs?.map((run) =>
    cover(mask, run.isPrivate, 'a private procedure', [
      run.title,
      run.forLabel,
      ...run.undone.map((step) => step.text),
    ])
      ? {
          ...run,
          title: 'a private procedure',
          forLabel: null,
          undone: [],
        }
      : run,
  ),
  synced: input.synced.map((copy) =>
    cover(mask, copy.isPrivate, 'a private item', [
      copy.title,
      copy.subtitle,
      copy.detail,
      copy.placeLabel,
    ])
      ? {
          ...copy,
          title: 'a private item',
          subtitle: null,
          detail: null,
          placeLabel: null,
          amountCents: null,
          extra: {},
        }
      : copy,
  ),
});
