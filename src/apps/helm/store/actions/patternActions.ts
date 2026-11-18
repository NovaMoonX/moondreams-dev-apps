import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';
import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { dayKeyToMs, shiftDayKeyBy } from '@/utils/cadenceUtils';
import { HELM_COPY, PRUNE_RUN_CAP } from '@apps/helm/constants';
import {
  habitDayKey,
  readPauseSpans,
  type DayPart,
} from '@apps/helm/engine/habitDay';
import type { LifeDay } from '@apps/helm/engine/habitLife';
import {
  CUT_EVIDENCE,
  patternDocId,
  readPatternMove,
  toPatternFields,
} from '@apps/helm/engine/patternCheck';
import {
  applyConfirm,
  applyNo,
  applyReopen,
  applyRetire,
  applyStop,
  buildPatternLines,
  detectDoneOutsideWindow,
  detectPlannedSlotMissed,
  detectWindowMissed,
  patternFamily,
  pickTodayOffer,
  readSaidCandidates,
  readSaidLinkCandidates,
  type DetectHabit,
  type PatternFinding,
  type PlannedSlot,
} from '@apps/helm/engine/patterns';
import type { SaidObservation } from '@apps/helm/engine/said';
import { openJson, sealJson } from '@apps/helm/security';
import { toLifeDay } from '@apps/helm/store/actions/habitJudgementActions';
import { updateHabitWhen } from '@apps/helm/store/actions/habitActions';
import { updateProject } from '@apps/helm/store/actions/projectActions';
import {
  selectShownObservations,
  selectShownReflections,
} from '@apps/helm/store/selectors/patternSelectors';
import { readUndoFields } from '@apps/helm/nomos/planUndo';
import type { UndoResult } from '@apps/helm/nomos/undoExecution';
import type {
  Execution,
  ExecutionSealed,
  HelmEncryption,
  OpenHabit,
  OpenObservation,
  OpenPattern,
  OpenReflection,
  Pattern,
  PatternSealed,
  PlanDay,
  Sealed,
  Task,
  TaskSealed,
} from '@apps/helm/types';
import { toWhenDraft, fromWhenDraft } from '@apps/helm/utils/habitDraft';
import { whyFingerprint } from '@apps/helm/utils/goalWhy';
import { toDayKey } from '@apps/helm/utils/planDays';
import type { PrivacyClass } from '@apps/helm/utils/privacy';

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const patternsOf = (uid: string) => collection(userOf(uid), 'patterns');
const executionsOf = (uid: string) => collection(userOf(uid), 'executions');

const HABIT_WEEKS_READ = 10;
const PLAN_WEEKS_READ = 8;
const WHY_SUMMARY_CAP = 120;
const WHY_TAGS_CAP = 5;

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

export type PatternChangeResult = 'saved' | 'kept' | 'missing' | 'offline';

/** Re-reads one pattern in a transaction and writes the fields `change` makes of what is stored, so an answer given on another device meanwhile is never overwritten; `null` leaves it. */
async function changePattern(
  uid: string,
  id: string,
  change: (current: Pattern, now: number) => Partial<Pattern> | null,
): Promise<PatternChangeResult> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(patternsOf(uid), id);
  try {
    return await runHeldTransaction(
      uid,
      async (transaction): Promise<PatternChangeResult> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const now = Date.now();
        const patch = change(snapshot.data() as Pattern, now);
        if (patch === null) return 'kept';
        transaction.update(ref, { ...patch, lastEditedAt: now });
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

const toMidnight = (todayKey: string) => dayKeyToMs(todayKey);

/** "Not now": the wait grows with the count and the third is final. */
export const notNowPattern = (uid: string, id: string, todayKey: string) =>
  changePattern(uid, id, (current, now) =>
    current.state === 'suggested' || current.state === 'candidate'
      ? applyNo(current, {
          to: 'declined',
          now,
          today: toMidnight(todayKey),
          by: 'person',
        })
      : null,
  );

/** "It's right" on a statement that offers no change: the pattern stays as it is, waits like Not now and never counts as a no. */
export const confirmPattern = (uid: string, id: string, todayKey: string) =>
  changePattern(uid, id, (current, now) =>
    current.state === 'suggested' && (current.confirmedAt ?? null) === null
      ? applyConfirm(current, { now, today: toMidnight(todayKey) })
      : null,
  );

/** "Stop suggesting that": never shown again unless reopened. */
export const stopPattern = (uid: string, id: string) =>
  changePattern(uid, id, (current, now) => applyStop(current, { now }));

/** Ends an accepted effect; the same pattern needs fresh evidence at normal thresholds. */
export const retirePattern = (uid: string, id: string) =>
  changePattern(uid, id, (current, now) =>
    current.state === 'accepted' ? applyRetire(current, { now }) : null,
  );

/** The only way back from off. */
export const reopenPattern = (uid: string, id: string) =>
  changePattern(uid, id, (current, now) =>
    current.offReason === null ? null : applyReopen(current, { now }),
  );

/** Marks what the person has now seen, so a card is not shown as new again. */
export async function markPatternsSeen(uid: string, ids: string[]) {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  const now = Date.now();
  ids.forEach((id) => batch.update(doc(patternsOf(uid), id), { seenAt: now }));
  await batch.commit();
}

const toSealedLines = (
  encryption: HelmEncryption,
  lines: Pick<PatternSealed, 'statement' | 'evidenceLine'>,
) => sealJson<PatternSealed>({ ...lines, reasonLine: null }, encryption);

interface CheckWorld {
  habits: OpenHabit[];
  days: Record<string, LifeDay>;
  slots: PlannedSlot[];
  observations: SaidObservation[];
  linkCandidates: OpenReflection['candidates'];
  isCareOf: (subject: { collection: string; id: string }) => boolean;
  today: string;
  timeZone: string;
  forgottenAt: number;
}

const toDetectHabit = (habit: OpenHabit): DetectHabit => habit;

const toSaid = (one: OpenObservation): SaidObservation => ({
  id: one.id,
  subject: one.subject,
  dayKey: one.dayKey,
  at: one.at,
  tags: one.tags,
  isCare: one.isCare,
});

/** Every finding the day's data supports, counting only what came after Forget and after each pattern's own answer. */
function detectAll(world: CheckWorld, since: number): PatternFinding[] {
  const running = world.habits.filter(
    (habit) =>
      !habit.isUnreadable &&
      habit.status === 'active' &&
      habit.forWhoId === null,
  );
  const base = {
    days: world.days,
    today: world.today,
    timeZone: world.timeZone,
  };
  const habitFindings = running.flatMap((habit) => [
    ...detectWindowMissed({ habit: toDetectHabit(habit), since, ...base }),
    ...detectDoneOutsideWindow({ habit: toDetectHabit(habit), since, ...base }),
  ]);
  const said = readSaidCandidates({
    observations: world.observations,
    habits: running.map((habit) => ({
      id: habit.id,
      isCare: habit.isCare,
      windowIds: Object.keys(habit.windowState),
    })),
    today: world.today,
    isPausedDay: (habitId, dayKey) =>
      readPauseSpans(
        running.find((habit) => habit.id === habitId) ?? running[0],
        world.timeZone,
      ).some(
        (span) => dayKey >= span.from && (span.to === null || dayKey < span.to),
      ),
  });
  const slots = detectPlannedSlotMissed({
    slots: world.slots,
    today: world.today,
    timeZone: world.timeZone,
    isInUse: (dayKey) => world.days[dayKey]?.isInUse === true,
    since,
  });
  const links = readSaidLinkCandidates({
    candidates: world.linkCandidates,
    observations: world.observations,
    isCareOf: world.isCareOf,
  });
  return [...habitFindings, ...said, ...slots, ...links];
}

const findAgain = (
  world: CheckWorld,
  finding: PatternFinding,
  habit: CheckWorld['habits'][number] | undefined,
  after: number,
  base: { days: CheckWorld['days']; today: string; timeZone: string },
): PatternFinding[] => {
  if (finding.kind === 'windowMissed' && habit)
    return detectWindowMissed({
      habit: toDetectHabit(habit),
      since: after,
      ...base,
    });
  if (finding.kind === 'doneOutsideWindow' && habit)
    return detectDoneOutsideWindow({
      habit: toDetectHabit(habit),
      since: after,
      ...base,
    });
  if (finding.kind === 'plannedSlotMissed')
    return detectPlannedSlotMissed({
      slots: world.slots,
      today: world.today,
      timeZone: world.timeZone,
      isInUse: (dayKey) => world.days[dayKey]?.isInUse === true,
      since: after,
    });
  const newer = world.observations.filter((one) => one.at > after);
  if (finding.kind === 'saidLink')
    return readSaidLinkCandidates({
      candidates: world.linkCandidates,
      observations: newer,
      isCareOf: world.isCareOf,
    });
  return habit
    ? readSaidCandidates({
        observations: world.observations,
        habits: [
          {
            id: habit.id,
            isCare: habit.isCare,
            windowIds: Object.keys(habit.windowState),
          },
        ],
        today: world.today,
        sinceBySignature: { [finding.signature]: after },
      })
    : [];
};

/** The same finding again, counting only evidence after `since`; null when it no longer holds. */
function recheck(
  world: CheckWorld,
  finding: PatternFinding,
  since: number,
): PatternFinding | null {
  const after = Math.max(since, world.forgottenAt);
  const habit = world.habits.find((one) => one.id === finding.subject.id);
  const base = {
    days: world.days,
    today: world.today,
    timeZone: world.timeZone,
  };
  const found = findAgain(world, finding, habit, after, base);
  return found.find((one) => one.signature === finding.signature) ?? null;
}

const readSubjectName = (finding: PatternFinding) => {
  const { helm } = store.getState();
  return finding.subject.collection === 'habits'
    ? (helm.habits.items.find((habit) => habit.id === finding.subject.id)
        ?.name ?? '')
    : finding.subject.collection === 'projects'
      ? (helm.projects.items.find((one) => one.id === finding.subject.id)
          ?.name ?? '')
      : '';
};

const readPrivacyOf = (
  finding: PatternFinding,
  observations: OpenObservation[],
): PrivacyClass => {
  const { helm } = store.getState();
  const habit = helm.habits.items.find((one) => one.id === finding.subject.id);
  const ids =
    finding.evidence.kind === 'said' ? finding.evidence.observationIds : [];
  return finding.isCare ||
    habit?.privacy === 'private' ||
    observations.some(
      (one) => ids.includes(one.id) && one.privacy === 'private',
    )
    ? 'private'
    : 'ordinary';
};

const toActedExecution = async (
  encryption: HelmEncryption,
  input: {
    patternId: string;
    summary: string;
    privacy: PrivacyClass;
    previous: Record<string, unknown> | null;
    now: number;
  },
): Promise<Execution> => ({
  captureId: null,
  actor: 'nomos',
  via: null,
  category: 'plan',
  autonomyLevel: 2,
  state: 'succeeded',
  effectRefs: [
    {
      op: input.previous === null ? 'create' : 'update',
      collection: 'patterns',
      docId: input.patternId,
    },
  ],
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
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
      effects: [
        {
          written: { state: 'accepted', acceptedBy: 'auto' },
          previous: input.previous,
        },
      ],
      undoReport: null,
      spoken: null,
      heldSpoken: null,
      goneIds: null,
      undoReason: null,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    encryption,
  ),
});

const readActedSummary = (finding: PatternFinding) =>
  finding.bucket.kind === 'weekdayPart'
    ? HELM_COPY.patternPlannedSlotActed(
        HELM_COPY.patternPartPlural[finding.bucket.part as DayPart],
      )
    : finding.kind;

/** One finding in one transaction on its own id, so two devices make one pattern. A Helm-planned thing is accepted and told at once, with its execution in the same transaction. */
async function writeFinding(
  uid: string,
  encryption: HelmEncryption,
  world: CheckWorld,
  finding: PatternFinding,
  observations: OpenObservation[],
) {
  const id = patternDocId(finding);
  const ref = doc(patternsOf(uid), id);
  const lines = buildPatternLines({ finding, name: readSubjectName(finding) });
  const privacy = readPrivacyOf(finding, observations);
  await runHeldTransaction(uid, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? (snapshot.data() as Pattern) : null;
    const now = Date.now();
    const move = readPatternMove({
      current,
      finding,
      recheck: (since) => recheck(world, finding, since),
      today: dayKeyToMs(world.today),
    });
    if (move.kind === 'skip') return;
    const evidenceFinding = move.kind === 'comeBack' ? move.fresh : finding;
    const sealed = await toSealedLines(encryption, lines);
    const fields =
      move.kind === 'create'
        ? toPatternFields(finding, { now, privacy })
        : null;
    const stateFields = {
      state: 'candidate' as const,
      isLive: true,
      stateAt: now,
      history: [
        ...(current?.history ?? []),
        { to: 'candidate' as const, at: now, by: 'nomos' as const },
      ].slice(-20),
    };
    const evidenceFields = {
      evidence: evidenceFinding.evidence,
      effect: evidenceFinding.effect,
      lastEvidenceAt: evidenceFinding.lastEvidenceAt,
      sourceKeys: toPatternFields(evidenceFinding, { now, privacy }).sourceKeys,
      sealed,
    };
    const isActing =
      finding.handling === 'actAndTell' && move.kind !== 'refresh';
    const executionRef = isActing ? doc(executionsOf(uid)) : null;
    const actFields = isActing
      ? {
          state: 'accepted' as const,
          acceptedBy: 'auto' as const,
          executionId: executionRef?.id ?? null,
          undoneByExecutionId: null,
          undoneDocIds: null,
          partUndoIds: null,
          history: [
            ...(move.kind === 'create' ? [] : stateFields.history),
            { to: 'accepted' as const, at: now, by: 'nomos' as const },
          ].slice(-20),
        }
      : {};
    if (move.kind === 'create' && fields) {
      transaction.set(ref, { ...fields, ...actFields, sealed });
    } else {
      transaction.update(ref, {
        ...evidenceFields,
        ...(move.kind === 'comeBack' ? stateFields : {}),
        ...actFields,
        lastEditedAt: now,
      });
    }
    if (executionRef) {
      transaction.set(
        executionRef,
        await toActedExecution(encryption, {
          patternId: id,
          summary: readActedSummary(finding),
          privacy,
          previous: current === null ? null : { state: current.state },
          now,
        }),
      );
    }
  });
}

/** Offers today's one new thing: the best waiting candidate becomes suggested, if no other new one was shown today and fewer than three are out. */
async function offerOne(uid: string, todayKey: string, timeZone: string) {
  const live = await getDocs(
    query(patternsOf(uid), where('isLive', '==', true), limit(500)),
  );
  const patterns = live.docs.map((entry) => ({
    id: entry.id,
    pattern: entry.data() as Pattern,
  }));
  const isShownToday = (pattern: Pattern) =>
    pattern.history.some(
      (event) =>
        event.to === 'suggested' &&
        habitDayKey(event.at, timeZone) === todayKey,
    );
  const pick = pickTodayOffer({
    patterns: patterns.filter(
      ({ pattern }) => patternFamily(pattern.kind) === 'noticed',
    ),
    suggestedCount: patterns.filter(
      ({ pattern }) =>
        pattern.state === 'suggested' &&
        pattern.handling !== 'actAndTell' &&
        (pattern.confirmedAt ?? null) === null,
    ).length,
    isNewShownToday: patterns.some(({ pattern }) => isShownToday(pattern)),
    today: dayKeyToMs(todayKey),
    isLearningOn: store.getState().helm.profile?.isLearningOn !== false,
  });
  if (pick === null) return;
  await changePattern(uid, pick, (current, now) =>
    current.state === 'candidate' && current.handling !== 'actAndTell'
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

const dayRange = (toKey: string, weeks: number) => ({
  from: shiftDayKeyBy(toKey, -weeks * 7),
  to: toKey,
});

async function readHabitDays(uid: string, todayKey: string) {
  const range = dayRange(todayKey, HABIT_WEEKS_READ);
  const snapshot = await getDocs(
    query(
      collection(userOf(uid), 'habitDays'),
      where(documentId(), '>=', range.from),
      where(documentId(), '<=', range.to),
    ),
  );
  return Object.fromEntries(
    snapshot.docs.map((entry) => [entry.id, toLifeDay(entry.data())]),
  );
}

/** Helm's own slots from the last eight weeks, each with whether its task was done that day and whether it is a care task, which Helm never plans around. */
async function readPlannedSlots(
  uid: string,
  encryption: HelmEncryption,
  todayKey: string,
  timeZone: string,
): Promise<PlannedSlot[]> {
  const range = dayRange(todayKey, PLAN_WEEKS_READ);
  const snapshot = await getDocs(
    query(
      collection(userOf(uid), 'planDays'),
      where(documentId(), '>=', range.from),
      where(documentId(), '<=', range.to),
    ),
  );
  const raw = snapshot.docs.flatMap((entry) =>
    Object.values((entry.data() as Partial<PlanDay>).slots ?? {})
      .filter((slot) => slot.source === 'nomos' && slot.startAt !== null)
      .map((slot) => ({ dayKey: entry.id, slot })),
  );
  const taskIds = [...new Set(raw.map(({ slot }) => slot.taskId))];
  const read = createSealedReader(encryption, openJson);
  const tasks = new Map(
    await Promise.all(
      taskIds.map(
        async (
          id,
        ): Promise<
          [string, { done: number | null; isCare: boolean } | null]
        > => {
          const entry = await getDoc(doc(userOf(uid), 'tasks', id));
          if (!entry.exists()) return [id, null];
          const data = entry.data() as Task;
          const sealed = await read<Partial<TaskSealed>>(
            data.sealed as Sealed,
          ).catch(() => null);
          return [
            id,
            {
              done: data.completedAt,
              isCare: sealed?.privateMark === 'care',
            },
          ];
        },
      ),
    ),
  );
  return raw.map(({ dayKey, slot }) => {
    const task = tasks.get(slot.taskId) ?? null;
    return {
      dayKey,
      taskId: slot.taskId,
      startAt: slot.startAt,
      status: slot.status,
      source: slot.source,
      isDone: task?.done != null && toDayKey(task.done, timeZone) === dayKey,
      isCare: task?.isCare ?? false,
    };
  });
}

/** A goal's why summary and tags refreshed by the nightly pass, only while they were made from the words still there. */
async function applyWhyRefresh(
  uid: string,
  encryption: HelmEncryption,
  reflection: OpenReflection,
) {
  await Promise.all(
    reflection.whyRefresh.map(async (item) => {
      const project = store
        .getState()
        .helm.projects.items.find((one) => one.id === item.projectId);
      if (
        !project ||
        project.isUnreadable ||
        !project.why ||
        project.why.basedOn !== item.basedOn ||
        whyFingerprint(project.why.verbatim) !== item.basedOn
      )
        return;
      await updateProject(uid, encryption, project.id, {
        name: project.name,
        emoji: project.emoji,
        objective: project.objective,
        targetDate: project.targetDate,
        why: (previous) =>
          previous && whyFingerprint(previous.verbatim) === item.basedOn
            ? {
                ...previous,
                summary: item.summary.slice(0, WHY_SUMMARY_CAP),
                tags: item.tags.slice(0, WHY_TAGS_CAP),
              }
            : previous,
      });
    }),
  );
}

const CHUNK = 400;

const deleteInChunks = async (refs: ReturnType<typeof doc>[]) => {
  const groups = Array.from(
    { length: Math.ceil(refs.length / CHUNK) },
    (_, at) => refs.slice(at * CHUNK, (at + 1) * CHUNK),
  );
  await groups.reduce(async (before, group) => {
    await before;
    const batch = writeBatch(db);
    group.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }, Promise.resolve());
};

/** Makes what Forget hid go: observations, reflections and patterns made at or before the stamp are deleted, except a stopped pattern, which is kept cut down to its signature so its stop still holds. At most a run's cap each time. */
export async function deleteForgotten(
  uid: string,
  encryption: HelmEncryption,
  forgottenAt: number,
) {
  const [observations, reflections, patterns] = await Promise.all(
    ['observations', 'reflections', 'patterns'].map((name) =>
      getDocs(
        query(
          collection(userOf(uid), name),
          where('createdAt', '<=', forgottenAt),
          limit(PRUNE_RUN_CAP),
        ),
      ),
    ),
  );
  const isStopped = (entry: (typeof patterns.docs)[number]) =>
    (entry.data() as Partial<Pattern>).offReason != null;
  await deleteInChunks([
    ...observations.docs.map((entry) => entry.ref),
    ...reflections.docs.map((entry) => entry.ref),
    ...patterns.docs
      .filter((entry) => !isStopped(entry))
      .map((entry) => entry.ref),
  ]);
  const cut = patterns.docs.filter(isStopped);
  if (cut.length === 0) return;
  const sealed = await toSealedLines(encryption, {
    statement: '',
    evidenceLine: '',
  });
  const batch = writeBatch(db);
  cut.forEach((entry) =>
    batch.update(entry.ref, {
      evidence: CUT_EVIDENCE,
      sourceKeys: [],
      reasons: [],
      history: [],
      sealed,
    }),
  );
  await batch.commit();
}

export interface ForgetStamp {
  /** What `forgottenAt` was, so Undo can put it back. */
  previous: number | null;
  stampedAt: number;
}

/** Forget what you've noticed: hides everything made so far at once; the deletion follows the Undo window and the next daily check. */
export async function forgetAllNoticed(
  uid: string,
  previous: number | null,
): Promise<ForgetStamp> {
  const stampedAt = Date.now();
  await updateDoc(userOf(uid), { forgottenAt: stampedAt });
  return { previous, stampedAt };
}

/** Undo of Forget, while nothing is deleted yet: the old stamp comes back and what it hid shows again. */
export const undoForgetAll = (uid: string, stamp: ForgetStamp) =>
  updateDoc(userOf(uid), { forgottenAt: stamp.previous });

/** The deletion that follows Forget when its toast closes; nothing is deleted when Undo put the old stamp back, and offline the next daily check does it. */
export async function finishForget(uid: string, stamp: ForgetStamp) {
  if (!navigator.onLine) return;
  if (store.getState().helm.profile?.forgottenAt !== stamp.stampedAt) return;
  await deleteForgotten(uid, await getHelmEncryption(uid), stamp.stampedAt);
}

/** Ends a pattern whose evidence was words that are now gone, keeping its answer, in a transaction beside the deletes. */
const retireFor = (
  transaction: Transaction,
  uid: string,
  pattern: { id: string; data: Pattern },
  now: number,
) =>
  transaction.update(doc(patternsOf(uid), pattern.id), {
    ...applyRetire(pattern.data, { now }),
    evidence: pattern.data.evidence,
    lastEditedAt: now,
  });

/** "Forget these words": deletes the chosen observations and ends the pattern they supported. */
export async function forgetWords(
  uid: string,
  patternId: string,
  observationIds: string[],
) {
  await runHeldTransaction(uid, async (transaction) => {
    const ref = doc(patternsOf(uid), patternId);
    const snapshot = await transaction.get(ref);
    observationIds.forEach((id) =>
      transaction.delete(doc(userOf(uid), 'observations', id)),
    );
    if (snapshot.exists())
      retireFor(
        transaction,
        uid,
        { id: patternId, data: snapshot.data() as Pattern },
        Date.now(),
      );
  });
}

/** "Forget what I noted": deletes what one turn left, ends any pattern that cited it, and says whether anything was there. */
export async function forgetTurnObservations(
  uid: string,
  captureId: string,
): Promise<boolean> {
  const found = await getDocs(
    query(
      collection(userOf(uid), 'observations'),
      where('sourceKeys', 'array-contains', `captures/${captureId}`),
    ),
  );
  if (found.empty) return false;
  const ids = new Set(found.docs.map((entry) => entry.id));
  const citing = store
    .getState()
    .helm.patterns.items.filter(
      (pattern) =>
        pattern.evidence.kind === 'said' &&
        pattern.evidence.observationIds.some((id) => ids.has(id)),
    );
  await runHeldTransaction(uid, async (transaction) => {
    const reads = await Promise.all(
      citing.map((pattern) =>
        transaction.get(doc(patternsOf(uid), pattern.id)),
      ),
    );
    found.docs.forEach((entry) => transaction.delete(entry.ref));
    const now = Date.now();
    reads.forEach((snapshot) => {
      if (snapshot.exists())
        retireFor(
          transaction,
          uid,
          { id: snapshot.id, data: snapshot.data() as Pattern },
          now,
        );
    });
  });
  return true;
}

/** Takes the person's yes: a change to a habit they set is written through the habit's own edit, then the pattern is marked accepted; nothing is marked when the habit could not be changed. */
export async function acceptPattern(
  uid: string,
  encryption: HelmEncryption,
  pattern: OpenPattern,
): Promise<PatternChangeResult | 'unreadable'> {
  const habitId =
    pattern.effect.kind === 'moveWindow' ||
    pattern.effect.kind === 'lowerCadence' ||
    pattern.effect.kind === 'raiseCadence'
      ? pattern.effect.habitId
      : null;
  const habit =
    habitId === null
      ? null
      : (store.getState().helm.habits.items.find((one) => one.id === habitId) ??
        null);
  if (habitId !== null && (!habit || habit.isUnreadable)) return 'missing';
  const written = habit
    ? await writeHabitEffect(uid, encryption, pattern, habit)
    : 'saved';
  if (written !== 'saved') return written;
  return changePattern(uid, pattern.id, (current, now) =>
    current.state === 'suggested' || current.state === 'candidate'
      ? {
          state: 'accepted',
          acceptedBy: 'person',
          stateAt: now,
          history: [
            ...current.history,
            { to: 'accepted' as const, at: now, by: 'person' as const },
          ].slice(-20),
        }
      : null,
  );
}

async function writeHabitEffect(
  uid: string,
  encryption: HelmEncryption,
  pattern: OpenPattern,
  habit: OpenHabit,
): Promise<PatternChangeResult | 'unreadable'> {
  const { effect } = pattern;
  const draft = toWhenDraft(habit);
  const next =
    effect.kind === 'moveWindow'
      ? {
          ...draft,
          windows: draft.windows.map((window) =>
            window.id === effect.windowId
              ? { ...window, start: effect.start, end: effect.end }
              : window,
          ),
        }
      : effect.kind === 'lowerCadence' || effect.kind === 'raiseCadence'
        ? withCadence(draft, effect.cadence)
        : null;
  if (
    next === null ||
    (effect.kind === 'moveWindow' &&
      !draft.windows.some((window) => window.id === effect.windowId))
  )
    return next === null ? 'saved' : 'missing';
  const result = await updateHabitWhen(
    uid,
    encryption,
    habit.id,
    fromWhenDraft(next, habit, Date.now()),
  );
  return result === 'saved' ? 'saved' : result;
}

const withCadence = (
  draft: ReturnType<typeof toWhenDraft>,
  cadence: Extract<Pattern['effect'], { kind: 'lowerCadence' }>['cadence'],
) => ({
  ...draft,
  often: cadence.kind === 'everyNDays' ? ('everyDay' as const) : cadence.kind,
  weekdays: cadence.kind === 'onWeekdays' ? cadence.weekdays : [],
  weekCount: cadence.kind === 'timesPerWeek' ? cadence.count : draft.weekCount,
});

/** Takes back what Helm did on its own in one transaction: the pattern becomes a no (the wait grows, the third is final), an Undo line is written, and the original is marked undone. */
export async function undoPatternExecution(
  uid: string,
  encryption: HelmEncryption,
  executionId: string,
): Promise<UndoResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const executionRef = doc(executionsOf(uid), executionId);
  const undoRef = doc(executionsOf(uid));
  const todayKey = toDayKey(
    Date.now(),
    store.getState().helm.profile?.timeZone ?? 'UTC',
  );
  try {
    return await runHeldTransaction(
      uid,
      async (transaction): Promise<UndoResult> => {
        const snapshot = await transaction.get(executionRef);
        const original = snapshot.exists()
          ? (snapshot.data() as Execution)
          : null;
        const ref = original?.effectRefs.find(
          (effect) => effect.collection === 'patterns',
        );
        if (!original || !ref)
          return { kind: 'refused', reason: 'missing', report: null };
        if (original.undoneByExecutionId !== null)
          return { kind: 'refused', reason: 'alreadyUndone', report: null };
        const patternRef = doc(patternsOf(uid), ref.docId);
        const patternSnapshot = await transaction.get(patternRef);
        const pattern = patternSnapshot.exists()
          ? (patternSnapshot.data() as Pattern)
          : null;
        if (!pattern || pattern.executionId !== executionId)
          return { kind: 'refused', reason: 'notUndoable', report: null };
        const now = Date.now();
        transaction.update(patternRef, {
          ...applyNo(pattern, {
            to: 'undone',
            now,
            today: dayKeyToMs(todayKey),
            by: 'person',
          }),
          undoneByExecutionId: undoRef.id,
          lastEditedAt: now,
        });
        const summary = HELM_COPY.patternTookBack(
          (
            await openJson<ExecutionSealed>(original.sealed, encryption).catch(
              () => null,
            )
          )?.summary ?? '',
        );
        transaction.set(undoRef, {
          captureId: original.captureId,
          actor: 'person',
          via: null,
          category: 'undo',
          autonomyLevel: 1,
          state: 'succeeded',
          effectRefs: [
            { op: 'update', collection: 'patterns', docId: ref.docId },
          ],
          linkedWhoIds: [],
          linkedPlaceIds: [],
          undoesExecutionId: executionId,
          undoneByExecutionId: null,
          undoneDocIds: null,
          partUndoIds: null,
          questionRef: null,
          errorCode: null,
          privacy: original.privacy,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: await sealJson<ExecutionSealed>(
            {
              summary,
              said: null,
              commands: [],
              effects: [
                {
                  written: { state: 'undone' },
                  previous: { state: pattern.state },
                },
              ],
              undoReport: HELM_COPY.patternTookBackReport,
              spoken: null,
              heldSpoken: null,
              goneIds: null,
              undoReason: null,
              lines: null,
              abilityOffer: null,
              awayZoneOffer: null,
            },
            encryption,
          ),
        } satisfies Execution);
        const earlier = readUndoFields(original);
        const undoneDocIds = [
          ...new Set([
            ...earlier.undoneDocIds,
            ...original.effectRefs.map((effect) => effect.docId),
          ]),
        ];
        transaction.update(executionRef, {
          undoneByExecutionId: undoRef.id,
          undoneDocIds,
          partUndoIds: [...earlier.partUndoIds, undoRef.id],
        });
        return {
          kind: 'done',
          undoExecutionId: undoRef.id,
          report: HELM_COPY.patternTookBackReport,
          isFinal: true,
          undoneDocIds,
          objectPaths: [],
        };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

/** The Undo beside "Today's evening left empty": takes back the execution that accepted the pattern. */
export async function undoPattern(
  uid: string,
  encryption: HelmEncryption,
  pattern: Pick<OpenPattern, 'executionId'>,
): Promise<UndoResult> {
  return pattern.executionId === null
    ? { kind: 'refused', reason: 'notUndoable', report: null }
    : undoPatternExecution(uid, encryption, pattern.executionId);
}

export interface DailyCheckContext {
  todayKey: string;
  timeZone: string;
}

/** The once-a-day pass: notices what the last weeks show, weighs last night's reflections, offers at most one new thing, and marks the day checked only when every write landed. A person who turned learning off is never read. */
export async function runDailyPatternCheck(
  uid: string,
  encryption: HelmEncryption,
  context: DailyCheckContext,
): Promise<'skipped' | 'checked' | 'partial'> {
  const { todayKey, timeZone } = context;
  const { helm } = store.getState();
  const profile = helm.profile;
  if (!profile || !navigator.onLine) return 'skipped';
  if (profile.forgottenAt !== null)
    await deleteForgotten(uid, encryption, profile.forgottenAt);
  if (profile.isLearningOn === false || profile.patternsCheckedOn === todayKey)
    return 'skipped';
  const state = store.getState();
  const observations = selectShownObservations(state);
  const reflections = selectShownReflections(state);
  const forgottenAt = profile.forgottenAt ?? 0;
  const [days, slots] = await Promise.all([
    readHabitDays(uid, todayKey),
    readPlannedSlots(uid, encryption, todayKey, timeZone),
  ]);
  const careProjects = new Set(
    helm.projects.items
      .filter((project) => project.privateMark === 'care')
      .map((project) => project.id),
  );
  const world: CheckWorld = {
    habits: helm.habits.items,
    days,
    slots,
    observations: observations.map(toSaid),
    linkCandidates: reflections.flatMap((one) => one.candidates),
    isCareOf: (subject) =>
      subject.collection === 'habits'
        ? (helm.habits.items.find((habit) => habit.id === subject.id)?.isCare ??
          false)
        : careProjects.has(subject.id),
    today: todayKey,
    timeZone,
    forgottenAt,
  };
  const findings = detectAll(world, forgottenAt);
  const foundIds = new Set(findings.map(patternDocId));
  const outcomes = await Promise.allSettled([
    ...findings.map((finding) =>
      writeFinding(uid, encryption, world, finding, observations),
    ),
    ...helm.patterns.items
      .filter(
        (pattern) =>
          pattern.state === 'candidate' &&
          pattern.kind !== 'saidLink' &&
          patternFamily(pattern.kind) === 'noticed' &&
          !foundIds.has(pattern.id),
      )
      .map((pattern) =>
        changePattern(uid, pattern.id, (current, now) =>
          current.state === 'candidate' ? applyRetire(current, { now }) : null,
        ),
      ),
  ]);
  const isWhole = outcomes.every((outcome) => outcome.status === 'fulfilled');
  outcomes.forEach((outcome) => {
    if (outcome.status === 'rejected')
      console.error('A pattern was not written', outcome.reason);
  });
  if (!isWhole) return 'partial';
  await Promise.allSettled(
    reflections.map((reflection) =>
      applyWhyRefresh(uid, encryption, reflection),
    ),
  );
  await offerOne(uid, todayKey, timeZone);
  const seenAt = Date.now();
  await Promise.all(
    reflections.map((reflection) =>
      updateDoc(doc(userOf(uid), 'reflections', reflection.id), { seenAt }),
    ),
  );
  await updateDoc(userOf(uid), { patternsCheckedOn: todayKey });
  return 'checked';
}
