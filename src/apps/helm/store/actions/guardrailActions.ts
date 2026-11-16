import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { store } from '@/store';
import { dayKeyToMs } from '@/utils/cadenceUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  checkOnStart,
  readUntil,
  type GuardrailRecord,
} from '@apps/helm/engine/guardrails';
import { patternDocId } from '@apps/helm/engine/patternCheck';
import { isPatternEligible } from '@apps/helm/engine/patterns';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sealJson } from '@apps/helm/security';
import { setHabitStatus } from '@apps/helm/store/actions/habitActions';
import {
  pickGoalBackUp,
  setGoalAside,
} from '@apps/helm/store/actions/goalActions';
import { setProjectStatus } from '@apps/helm/store/actions/projectActions';
import {
  changePattern,
  writeFinding,
  type PatternChangeResult,
} from '@apps/helm/store/actions/patternActions';
import type {
  Execution,
  ExecutionSealed,
  HelmEncryption,
  OpenPattern,
  Pattern,
} from '@apps/helm/types';
import { buildGuardrailInput } from '@apps/helm/utils/guardrailInput';
import type { PrivacyClass } from '@apps/helm/utils/privacy';

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
  privacy: PrivacyClass;
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
          privacy: habit.privacy ?? 'ordinary',
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
    privacy: project.privacy ?? 'ordinary',
    isGoal: project.kind === 'goal',
    collection: 'projects',
    ...(project.kind === 'goal'
      ? setGoalAside(uid, project.id, until)
      : setProjectStatus(uid, project, 'paused', until)),
  };
}

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** What an answered guardrail did, as the line Activity and the list show; `isHold` is the new thing held itself. */
export const readAnsweredLine = (
  name: string,
  until: number | null,
  isHold: boolean,
) => {
  const date = until === null ? null : formatDateShortUTC(until);
  return isHold
    ? HELM_COPY.guardrailRowHeld(name, date)
    : HELM_COPY.guardrailRowPaused(name, date);
};

const toExecution = async (
  encryption: HelmEncryption,
  input: {
    summary: string;
    report: string | null;
    privacy: PrivacyClass;
    undoes: string | null;
    now: number;
  },
): Promise<Execution> => ({
  captureId: null,
  actor: 'person',
  via: null,
  category: input.undoes === null ? 'plan' : 'undo',
  autonomyLevel: 1,
  state: 'succeeded',
  effectRefs: [],
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: input.undoes,
  undoneByExecutionId: null,
  undoneDocIds: null,
  partUndoIds: null,
  questionRef: null,
  errorCode: null,
  privacy: input.privacy,
  createdAt: input.now,
  decidedAt: input.now,
  finishedAt: input.now,
  sealed: await sealJson<ExecutionSealed>(
    {
      summary: input.summary,
      said: null,
      commands: [],
      effects: [],
      undoReport: input.report,
      spoken: null,
      goneIds: null,
      undoReason: null,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    encryption,
  ),
});

/** Puts the pattern back to asked, with no wait before it can ask again. */
const restoreAsked = (
  uid: string,
  patternId: string,
  effect: Pattern['effect'],
) =>
  changePattern(uid, patternId, (current, now) =>
    current.state === 'accepted'
      ? {
          state: 'suggested',
          acceptedBy: null,
          effect,
          executionId: null,
          stateAt: now,
          history: [
            ...current.history,
            { to: 'suggested' as const, at: now, by: 'person' as const },
          ].slice(-20),
        }
      : null,
  );

/** Writes the Activity line for a take-back and marks the line it takes back; best effort, the take-back itself has already happened. */
async function recordTakenBack(
  uid: string,
  executionId: string,
  input: { summary: string; privacy: PrivacyClass },
) {
  try {
    const encryption = await getHelmEncryption(uid);
    const now = Date.now();
    const undoRef = doc(collection(userOf(uid), 'executions'));
    const batch = writeBatch(db);
    batch.set(
      undoRef,
      await toExecution(encryption, {
        summary: HELM_COPY.patternTookBack(input.summary),
        report: HELM_COPY.patternTookBackReport,
        privacy: input.privacy,
        undoes: executionId,
        now,
      }),
    );
    batch.update(doc(collection(userOf(uid), 'executions'), executionId), {
      undoneByExecutionId: undoRef.id,
      undoneDocIds: [],
      partUndoIds: [undoRef.id],
    });
    await batch.commit();
  } catch (error) {
    console.error('Helm guardrail take-back was not recorded', error);
  }
}

/** The person's yes to a guardrail: pauses, marks it accepted and hands back an Undo. Needs a connection. */
export async function acceptGuardrail(
  uid: string,
  pattern: OpenPattern,
  options: {
    target?: { collection: 'projects' | 'habits'; id: string };
    until?: number | null;
    isHold?: boolean;
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
  const encryption = await getHelmEncryption(uid).catch(() => null);
  const executionRef = doc(collection(userOf(uid), 'executions'));
  const line = readAnsweredLine(
    pausing.name,
    until,
    options.isHold === true && options.target === undefined,
  );
  const execution = encryption
    ? await toExecution(encryption, {
        summary: line,
        report: null,
        privacy: pausing.privacy,
        undoes: null,
        now: Date.now(),
      }).catch((error: unknown) => {
        console.error('Helm guardrail answer was not sealed', error);
        return null;
      })
    : null;
  const result = await changePattern(uid, pattern.id, (current, now) =>
    current.state === 'suggested' || current.state === 'candidate'
      ? {
          state: 'accepted',
          acceptedBy: 'person',
          executionId: execution ? executionRef.id : null,
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
  if (execution)
    void setDoc(executionRef, execution).catch((error: unknown) =>
      console.error('Helm guardrail answer was not recorded', error),
    );
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
      const restored = await restoreAsked(uid, pattern.id, pattern.effect);
      if (restored === 'saved' && encryption) {
        await recordTakenBack(uid, executionRef.id, {
          summary: line,
          privacy: pausing.privacy,
        });
      }
      return restored;
    },
  };
}

/** Takes back an answered guardrail's pause while the thing is still paused as the answer left it; the guardrail asks again, with no wait. Needs a connection. */
export async function undoGuardrailAnswer(
  uid: string,
  pattern: OpenPattern,
): Promise<PatternChangeResult> {
  if (!navigator.onLine) return 'offline';
  const { effect, subject } = pattern;
  if (effect.kind !== 'pause' || subject.id === null) return 'missing';
  const { helm } = store.getState();
  const habit =
    effect.collection === 'habits'
      ? helm.habits.items.find((one) => one.id === effect.id)
      : undefined;
  const project =
    effect.collection === 'projects'
      ? helm.projects.items.find((one) => one.id === effect.id)
      : undefined;
  const live = habit ?? project;
  if (!live || live.isUnreadable) return 'missing';
  if (live.status !== 'paused' || live.pausedUntil !== effect.until)
    return 'kept';
  const resuming = habit
    ? setHabitStatus(uid, habit, 'active')
    : project?.kind === 'goal'
      ? pickGoalBackUp(uid, project.id)
      : project
        ? setProjectStatus(uid, project, 'active')
        : null;
  if (!resuming) return 'missing';
  if (!(await writtenInTime(resuming.written))) return 'offline';
  const restored = await restoreAsked(uid, pattern.id, {
    kind: 'pause',
    collection: subject.collection === 'habits' ? 'habits' : 'projects',
    id: subject.id,
    until: readUntil(pattern.reasons),
  });
  if (restored === 'saved' && pattern.executionId !== null) {
    await recordTakenBack(uid, pattern.executionId, {
      summary: readAnsweredLine(
        live.name,
        effect.until,
        pattern.subject.otherId === pattern.subject.id &&
          effect.id === pattern.subject.id,
      ),
      privacy: live.privacy ?? 'ordinary',
    });
  }
  return restored;
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
