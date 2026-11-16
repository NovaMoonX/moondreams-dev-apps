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
      undo: () => Promise<PatternChangeResult>;
    }
  | { kind: Exclude<PatternChangeResult, 'saved'> };

interface Pausing {
  name: string;
  isGoal: boolean;
  collection: 'projects' | 'habits';
  written: Promise<unknown>;
  undo: () => Promise<unknown>;
}

const WRITE_WAIT_MS = 8000;

const writtenInTime = (written: Promise<unknown>) =>
  new Promise<boolean>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(false), WRITE_WAIT_MS);
    written.then(
      () => {
        window.clearTimeout(timer);
        resolve(true);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });

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

/** The person's yes to a guardrail: pauses, marks it accepted and hands back an Undo. Needs a connection. */
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
  const stored = store
    .getState()
    .helm.patterns.items.find((one) => one.id === pattern.id);
  if (!stored) return { kind: 'missing' };
  if (stored.state !== 'suggested' && stored.state !== 'candidate')
    return { kind: 'kept' };
  const target = options.target ?? pattern.effect;
  const until =
    options.until === undefined ? pattern.effect.until : options.until;
  const pausing = pauseThing(uid, target, until);
  if (!pausing) return { kind: 'missing' };
  if (!(await writtenInTime(pausing.written))) {
    await pausing.undo();
    return { kind: 'offline' };
  }
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
  const undoing = { isDone: false };
  return {
    kind: 'saved',
    name: pausing.name,
    until,
    isGoal: pausing.isGoal,
    undo: async () => {
      if (undoing.isDone) return 'kept';
      if (!navigator.onLine) return 'offline';
      undoing.isDone = true;
      await pausing.undo();
      const timeZone = store.getState().helm.profile?.timeZone ?? 'UTC';
      return changePattern(uid, pattern.id, (current, now) =>
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

/** Weighs something just started and writes a guardrail when it meets the bar. Never speaks. */
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
