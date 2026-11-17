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
    { status: 'open' | 'done'; durationMinutes?: number | null }
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
}

const NOTHING: DayAimsPlan = {
  write: null,
  effectRefs: [],
  effects: [],
  overflow: 0,
};

/** Files what a turn answering the morning card named as that day's aims, in the order said: a task made this turn (a length said is not a guess) or one already open. The day's one document is written in the turn's transaction and recorded as an effect, so the turn's Undo puts it back with the tasks. */
export function planDayAims(input: DayAimsPlanInput): DayAimsPlan {
  const have = new Set(input.current?.view.aims.map((aim) => aim.taskId));
  const named = input.commands.flatMap(
    (command): { taskId: string; lengthIsGuess: boolean }[] => {
      if (command.kind === 'createTask') {
        const taskId = input.taskIdByRef[command.ref];
        return taskId
          ? [
              {
                taskId,
                lengthIsGuess: (command.durationMinutes ?? null) === null,
              },
            ]
          : [];
      }
      if (command.kind !== 'updateTask' || command.isAim !== true) return [];
      const made = input.taskIdByRef[command.taskId];
      if (made) return [{ taskId: made, lengthIsGuess: true }];
      const task = input.existing.get(command.taskId);
      return task?.status === 'open'
        ? [
            {
              taskId: command.taskId,
              lengthIsGuess: (task.durationMinutes ?? null) === null,
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
      overflow,
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
    overflow,
  };
}
