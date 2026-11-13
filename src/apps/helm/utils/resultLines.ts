import { HELM_COPY } from '@apps/helm/constants';
import { topicEffectKind } from '@apps/helm/nomos/planUndo';
import type { OpenExecution, OpenTask } from '@apps/helm/types';
import { formatTaskDue, toTaskDue } from '@apps/helm/utils/taskDue';

export interface ResultLine {
  key: string;
  docId: string;
  title: string;
  detail: string | null;
  /** The record a tap on the row opens. */
  ref?: {
    collection: 'notes' | 'topics' | 'procedures' | 'procedureRuns';
    id: string;
  };
  /** A line the turn said without writing anything, so an Undo has nothing to take back on it. */
  isNoEffect?: boolean;
}

const toText = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** One line per effect, from what the execution sealed, so a task that has since left the open list still shows. A field the effect didn't write (a task marked done keeps its title) comes from the open task when it is there. */
export function buildResultLines(
  execution: OpenExecution,
  tasksById: Map<string, OpenTask>,
  timeZone: string,
  now: number,
): ResultLine[] {
  const effectLines = execution.effectRefs.flatMap(
    (ref, index): ResultLine[] => {
      if (ref.collection === 'who' || ref.collection === 'places') return [];
      const effect = execution.effects[index];
      // A kept photo is said once, by the turn's photo line.
      if (ref.collection === 'media') return [];
      if (ref.collection === 'topics') {
        const title = toText(effect?.written['sealed.title']);
        const kind = effect ? topicEffectKind(effect) : 'filing';
        const hasLine =
          kind === 'made' ||
          (kind === 'version' &&
            effect?.written.change !== 'moved' &&
            effect?.written.change !== 'grouped') ||
          (kind === 'placement' && 'parentId' in (effect?.written ?? {}));
        return title && hasLine
          ? [
              {
                key: `${ref.docId}:${index}`,
                docId: ref.docId,
                title,
                detail: null,
                ref: { collection: 'topics', id: ref.docId },
              },
            ]
          : [];
      }
      if (ref.collection === 'procedures') {
        const title = toText(effect?.written['sealed.title']);
        return title
          ? [
              {
                key: `${ref.docId}:${index}`,
                docId: ref.docId,
                title,
                detail: null,
                ref: { collection: 'procedures', id: ref.docId },
              },
            ]
          : [];
      }
      if (ref.collection === 'procedureRuns') {
        const title = toText(effect?.written['sealed.title']);
        return title
          ? [
              {
                key: `${ref.docId}:${index}`,
                docId: ref.docId,
                title,
                detail: null,
                ref: { collection: 'procedureRuns', id: ref.docId },
              },
            ]
          : [];
      }
      if (ref.collection === 'notes') {
        return [
          {
            key: `${ref.docId}:${index}`,
            docId: ref.docId,
            title:
              toText(effect?.written['sealed.title']) ??
              toText(effect?.previous?.['sealed.title']) ??
              HELM_COPY.resultNoteFallback,
            detail: null,
            ref: { collection: 'notes', id: ref.docId },
          },
        ];
      }
      if (ref.collection === 'profile') {
        return [
          {
            key: `${ref.docId}:${index}`,
            docId: ref.docId,
            title:
              toText(effect?.written['sealed.title']) ?? HELM_COPY.homeTitle,
            detail:
              effect?.written.currentPlace === null
                ? HELM_COPY.homeLeft
                : HELM_COPY.homeRowDetail,
          },
        ];
      }
      if (ref.collection === 'projects') {
        const label = toText(effect?.written['sealed.title']);
        const name = toText(effect?.written['sealed.name']);
        return [
          {
            key: `${ref.docId}:${index}`,
            docId: ref.docId,
            title:
              label ??
              (name
                ? HELM_COPY.resultProjectLine(
                    toText(effect?.written['sealed.emoji']),
                    name,
                  )
                : HELM_COPY.projectUntitled),
            detail: null,
          },
        ];
      }
      if (ref.collection === 'keyDates') {
        return [
          {
            key: `${ref.docId}:${index}`,
            docId: ref.docId,
            title:
              toText(effect?.written['sealed.title']) ??
              toText(effect?.previous?.['sealed.title']) ??
              HELM_COPY.resultKeyDateFallback,
            detail: null,
          },
        ];
      }
      const task = tasksById.get(ref.docId);
      const title =
        toText(effect?.written['sealed.title']) ??
        toText(effect?.previous?.['sealed.title']) ??
        toText(task?.title) ??
        HELM_COPY.resultTaskFallback;
      if (ref.collection === 'facts') {
        return [
          {
            key: `${ref.docId}:${index}`,
            docId: ref.docId,
            title:
              toText(effect?.written['sealed.statement']) ??
              toText(effect?.written['sealed.title']) ??
              HELM_COPY.resultFactFallback,
            detail: toText(effect?.written['sealed.statement'])
              ? toText(effect?.written['sealed.title'])
              : null,
          },
        ];
      }
      const isDone = effect?.written.status === 'done';
      const due =
        effect && 'due' in effect.written
          ? toTaskDue(effect.written.due)
          : (task?.due ?? null);
      const detail = isDone
        ? HELM_COPY.resultDone
        : due
          ? HELM_COPY.resultTaskDue(formatTaskDue(due, timeZone, now))
          : null;
      return [
        { key: `${ref.docId}:${index}`, docId: ref.docId, title, detail },
      ];
    },
  );
  const lines = effectLines.filter((line, index) =>
    line.ref?.collection === 'notes'
      ? !effectLines.some(
          (other) =>
            other.ref?.collection === 'topics' && other.title === line.title,
        )
      : line.ref?.collection !== 'topics' ||
        effectLines.findIndex(
          (other) =>
            other.ref?.collection === 'topics' && other.title === line.title,
        ) === index,
  );
  const noteLines = (execution.lines ?? [])
    .filter(
      (line) =>
        !lines.some(
          (row) =>
            row.ref?.collection === line.ref.collection &&
            row.ref.id === line.ref.id &&
            row.title === line.text,
        ),
    )
    .map((line, index): ResultLine => ({
      key: `line:${index}`,
      docId: line.ref.id,
      title: line.text,
      detail: null,
      ref: line.ref,
      isNoEffect: true,
    }));
  return [...lines, ...noteLines];
}

/** The names of the people, pets, organizations and places an execution made, from what it sealed. */
export function readMadeEntities(execution: OpenExecution) {
  return execution.effectRefs.flatMap((ref, index) => {
    const isEntity = ref.collection === 'who' || ref.collection === 'places';
    const name = toText(execution.effects[index]?.written['sealed.name']);
    return isEntity && ref.op === 'create' && name
      ? [{ id: ref.docId, name }]
      : [];
  });
}
