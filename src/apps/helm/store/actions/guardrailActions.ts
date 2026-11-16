import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { store } from '@/store';
import { dayKeyToMs } from '@/utils/cadenceUtils';
import {
  checkOnStart,
  type GuardrailRecord,
} from '@apps/helm/engine/guardrails';
import { patternDocId } from '@apps/helm/engine/patternCheck';
import { applyNo, isPatternEligible } from '@apps/helm/engine/patterns';
import { setHabitStatus } from '@apps/helm/store/actions/habitActions';
import { setGoalAside } from '@apps/helm/store/actions/goalActions';
import { setProjectStatus } from '@apps/helm/store/actions/projectActions';
import {
  changePattern,
  writeFinding,
  type PatternChangeResult,
} from '@apps/helm/store/actions/patternActions';
import type { HelmEncryption, OpenPattern } from '@apps/helm/types';
import { buildGuardrailInput } from '@apps/helm/utils/guardrailInput';
import { toDayKey } from '@apps/helm/utils/planDays';

export type GuardrailAnswer =
  | {
      kind: 'saved';
      name: string;
      until: number | null;
      isGoal: boolean;
      /** Puts the thing back and counts the pause as a no. */
      undo: () => Promise<void>;
    }
  | { kind: Exclude<PatternChangeResult, 'saved'> };

interface Pausing {
  name: string;
  isGoal: boolean;
  collection: 'projects' | 'habits';
  written: Promise<unknown>;
  undo: () => Promise<unknown>;
}

/** Pauses a goal with its habits, a project or a habit through the actions the rest of Helm uses, until a date-only day or until it is picked back up. */
function pauseThing(
  uid: string,
  target: { collection: 'projects' | 'habits'; id: string },
  until: number | null,
): Pausing | null {
  const { helm } = store.getState();
  if (target.collection === 'habits') {
    const habit = helm.habits.items.find((one) => one.id === target.id);
    return habit && !habit.isUnreadable
      ? {
          name: habit.name,
          isGoal: false,
          collection: 'habits',
          ...setHabitStatus(uid, habit, 'paused', until),
        }
      : null;
  }
  const project = helm.projects.items.find((one) => one.id === target.id);
  if (!project || project.isUnreadable) return null;
  return {
    name: project.name,
    isGoal: project.kind === 'goal',
    collection: 'projects',
    ...(project.kind === 'goal'
      ? setGoalAside(uid, project.id, until)
      : setProjectStatus(uid, project, 'paused', until)),
  };
}

/** The person's yes to a guardrail: the pause is written through the existing pause actions (`target` pauses another thing instead, `until` another day), then the pattern is marked accepted. Needs a connection, so the pattern and the pause agree; the answer hands back its Undo. */
export async function acceptGuardrail(
  uid: string,
  pattern: OpenPattern,
  options: {
    target?: { collection: 'projects' | 'habits'; id: string };
    until?: number | null;
  } = {},
): Promise<GuardrailAnswer> {
  if (!navigator.onLine) return { kind: 'offline' };
  if (pattern.effect.kind !== 'pause') return { kind: 'missing' };
  const target = options.target ?? pattern.effect;
  const until =
    options.until === undefined ? pattern.effect.until : options.until;
  const pausing = pauseThing(uid, target, until);
  if (!pausing) return { kind: 'missing' };
  await pausing.written;
  const result = await changePattern(uid, pattern.id, (current, now) =>
    current.state === 'suggested' || current.state === 'candidate'
      ? {
          state: 'accepted',
          acceptedBy: 'person',
          stateAt: now,
          effect: {
            kind: 'pause',
            collection: pausing.collection,
            id: target.id,
            until,
          },
          history: [
            ...current.history,
            { to: 'accepted' as const, at: now, by: 'person' as const },
          ].slice(-20),
        }
      : null,
  );
  if (result !== 'saved') {
    await pausing.undo();
    return { kind: result };
  }
  return {
    kind: 'saved',
    name: pausing.name,
    until,
    isGoal: pausing.isGoal,
    undo: async () => {
      await pausing.undo();
      const timeZone = store.getState().helm.profile?.timeZone ?? 'UTC';
      await changePattern(uid, pattern.id, (current, now) =>
        current.state === 'accepted'
          ? applyNo(current, {
              to: 'undone',
              now,
              today: dayKeyToMs(toDayKey(now, timeZone)),
              by: 'person',
            })
          : null,
      );
    },
  };
}

/** The moment something is started: weighs it, writes a guardrail when it meets the bar and shows it at once, once. A pattern answered before waits out its back-off and so shows nothing. Never speaks. */
export async function runStartCheck(
  uid: string,
  encryption: HelmEncryption,
  record: GuardrailRecord,
  context: {
    todayKey: string;
    timeZone: string;
    grants: ConnectionGrantWithId[];
  },
): Promise<void> {
  const state = store.getState();
  if (!navigator.onLine || state.helm.profile?.isLearningOn === false) return;
  const finding = checkOnStart(
    record,
    buildGuardrailInput({
      state,
      now: Date.now(),
      ...context,
      days: state.helm.habitDays.byId,
    }),
  );
  if (!finding) return;
  await writeFinding(
    uid,
    encryption,
    { today: context.todayKey, recheck: () => finding },
    finding,
    [],
  );
  await changePattern(uid, patternDocId(finding), (current, now) =>
    current.state === 'candidate' &&
    isPatternEligible(current, dayKeyToMs(context.todayKey))
      ? {
          state: 'suggested',
          stateAt: now,
          history: [
            ...current.history,
            { to: 'suggested' as const, at: now, by: 'nomos' as const },
          ].slice(-20),
        }
      : null,
  );
}
