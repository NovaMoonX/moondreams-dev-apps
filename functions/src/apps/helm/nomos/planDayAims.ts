import type { SealedPayload } from '../../../appKeys/seal.js';
import { dayKeyToMs } from '../../../vendor/cadenceUtils.js';
import { MAX_DAY_AIMS, type Aim, type AimsView } from '../dayPlan/dayJob.js';
import type { NomosCommand } from './commands.js';
import type { Effect, EffectRef } from './executeCommands.js';

export interface DayAimsPlanInput {
  dayKey: string;
  commands: NomosCommand[];
  /** The id each task this turn makes was given, by its `$new` ref. */
  taskIdByRef: Record<string, string>;
  /** The open tasks the turn read, for an aim that names one the person already has. */
  existing: ReadonlyMap<
    string,
    {
      status: 'open' | 'done';
      durationMinutes?: number | null;
      title?: string;
      privacy?: string | null;
    }
  >;
  /** The day as stored: its aims, the sealed payload as it was and its state; null when there is no document yet. */
  current: { view: AimsView; sealed: SealedPayload; state: string } | null;
  newAimId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}

export interface DayAimsPlan {
  /** The one document to write, null when the turn named nothing that can be an aim. */
  write: {
    op: 'create' | 'update';
    data: Record<string, unknown>;
  } | null;
  effectRefs: EffectRef[];
  effects: Effect[];
  /** What the turn named that did not fit: over the day's cap. */
  overflow: number;
  /** The reply for the aims filed this turn ("Added 3 for today: A, B, C." / "Linked to A."), null when none were. */
  line: string | null;
  /** How many of the filed aims were made this turn and how many were tasks already open, so the turn's counts can leave them to `line`. */
  madeCount: number;
  linkedCount: number;
}

const TITLES_SHOWN = 3;

const listTitles = (titles: string[], isAnd: boolean) =>
  titles.length > TITLES_SHOWN
    ? `${titles.slice(0, TITLES_SHOWN).join(', ')} and ${titles.length - TITLES_SHOWN} more`
    : isAnd && titles.length === 2
      ? `${titles[0]} and ${titles[1]}`
      : titles.join(', ');

/** Worded from what was filed; a title that is missing or private is left out of the whole line, since the line is also spoken. */
function buildAimsLine(
  made: { title: string | null }[],
  linked: { title: string | null }[],
): string | null {
  const isNamed = [...made, ...linked].every((entry) => entry.title);
  const names = (entries: { title: string | null }[], isAnd: boolean) =>
    listTitles(
      entries.map((entry) => entry.title ?? ''),
      isAnd,
    );
  const added = made.length
    ? isNamed
      ? `Added ${made.length} for today: ${names(made, false)}.`
      : `Added ${made.length} for today.`
    : null;
  const joined = linked.length
    ? isNamed
      ? `Linked to ${names(linked, true)}.`
      : `Linked ${linked.length === 1 ? 'a task' : `${linked.length} tasks`} to today.`
    : null;
  return [added, joined].filter(Boolean).join(' ') || null;
}

const NOTHING: DayAimsPlan = {
  write: null,
  effectRefs: [],
  effects: [],
  overflow: 0,
  line: null,
  madeCount: 0,
  linkedCount: 0,
};

/** Files what a turn answering the morning card named as that day's aims, in the order said: a task made this turn (a length said is not a guess) or one already open. The day's one document is written in the turn's transaction and recorded as an effect, so the turn's Undo puts it back with the tasks. */
export function planDayAims(input: DayAimsPlanInput): DayAimsPlan {
  const have = new Set(input.current?.view.aims.map((aim) => aim.taskId));
  const privateRefs = new Set(
    input.commands.flatMap((command) =>
      command.kind === 'setPrivate' && command.isPrivate
        ? [command.taskId]
        : [],
    ),
  );
  const madeTitles = new Map(
    input.commands.flatMap((command) =>
      command.kind === 'createTask'
        ? [
            [
              command.ref,
              privateRefs.has(command.ref) ? null : command.title,
            ] as const,
          ]
        : [],
    ),
  );
  const named = input.commands.flatMap(
    (
      command,
    ): {
      taskId: string;
      lengthIsGuess: boolean;
      isMade: boolean;
      title: string | null;
    }[] => {
      if (command.kind === 'createTask') {
        const taskId = input.taskIdByRef[command.ref];
        return taskId
          ? [
              {
                taskId,
                lengthIsGuess: (command.durationMinutes ?? null) === null,
                isMade: true,
                title: madeTitles.get(command.ref) ?? null,
              },
            ]
          : [];
      }
      if (command.kind !== 'updateTask' || command.isAim !== true) return [];
      const made = input.taskIdByRef[command.taskId];
      if (made)
        return [
          {
            taskId: made,
            lengthIsGuess: true,
            isMade: true,
            title: madeTitles.get(command.taskId) ?? null,
          },
        ];
      const task = input.existing.get(command.taskId);
      return task?.status === 'open'
        ? [
            {
              taskId: command.taskId,
              lengthIsGuess: (task.durationMinutes ?? null) === null,
              isMade: false,
              title:
                task.privacy === 'private'
                  ? null
                  : (task.title?.trim() ?? null),
            },
          ]
        : [];
    },
  );
  const fresh = named.filter(
    (entry, at) =>
      !have.has(entry.taskId) &&
      named.findIndex((other) => other.taskId === entry.taskId) === at,
  );
  if (fresh.length === 0) return NOTHING;
  const before = input.current?.view.aims ?? [];
  const room = Math.max(0, MAX_DAY_AIMS - before.length);
  const first = before.reduce((max, aim) => Math.max(max, aim.order + 1), 0);
  const added = fresh.slice(0, room).map((entry, at): Aim => ({
    aimId: input.newAimId(),
    taskId: entry.taskId,
    order: first + at,
    lengthIsGuess: entry.lengthIsGuess,
    broughtFrom: null,
  }));
  const overflow = fresh.length - added.length;
  if (added.length === 0) return { ...NOTHING, overflow };
  const filed = fresh.slice(0, added.length);
  const made = filed.filter((entry) => entry.isMade);
  const linked = filed.filter((entry) => !entry.isMade);
  const report = {
    overflow,
    line: buildAimsLine(made, linked),
    madeCount: made.length,
    linkedCount: linked.length,
  };
  const sealed = input.seal({
    aims: [...before, ...added],
    windDown: input.current?.view.windDown ?? {},
  });
  const ref = (op: 'create' | 'update'): EffectRef => ({
    op,
    collection: 'dayAims',
    docId: input.dayKey,
  });
  if (!input.current)
    return {
      write: {
        op: 'create',
        data: {
          date: dayKeyToMs(input.dayKey),
          state: 'answered',
          windDownState: 'waiting',
          lookAt: null,
          rolledAt: null,
          sealed,
        },
      },
      effectRefs: [ref('create')],
      effects: [{ written: { sealed, state: 'answered' }, previous: null }],
      ...report,
    };
  return {
    write: { op: 'update', data: { sealed, state: 'answered' } },
    effectRefs: [ref('update')],
    effects: [
      {
        written: { sealed, state: 'answered' },
        previous: { sealed: input.current.sealed, state: input.current.state },
      },
    ],
    ...report,
  };
}
