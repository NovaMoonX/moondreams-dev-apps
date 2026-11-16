import { zonedDateTimeToEpoch } from '../../functions/src/notifications/zonedTime.ts';
import {
  patternDocId,
  toPatternFields,
} from '../../src/apps/helm/engine/patternCheck.ts';
import {
  buildPatternLines,
  patternSignature,
  readHandling,
  type PatternFinding,
} from '../../src/apps/helm/engine/patterns.ts';
import {
  buildSeenAsBasis,
  normaliseClaim,
  SEEN_AS_LIMITS,
  seenAsIdInput,
  type SeenAsKind,
  type SeenAsState,
} from '../../src/apps/helm/engine/seenAs.ts';
import { sealJson } from '../../src/apps/helm/security.ts';
import type { ObservationTag } from '../../src/apps/helm/engine/said.ts';
import type {
  Execution,
  ExecutionSealed,
  HelmEncryption,
  Observation,
  ObservationSealed,
  Pattern,
  PatternSealed,
  Reflection,
  ReflectionSealed,
  SeenAsLine,
  SeenAsSealed,
} from '../../src/apps/helm/types.ts';
import { createHash } from 'node:crypto';

const DAY_MS = 86_400_000;
export const LEARNING_ZONE = 'America/Los_Angeles';

const dayMs = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

/** The day key `back` days before `todayKey`. */
export const shiftKey = (todayKey: string, back: number) =>
  new Date(dayMs(todayKey) - back * DAY_MS).toISOString().slice(0, 10);

/** The last `count` dates of one weekday before today, newest first. */
export const lastWeekdayKeys = (
  todayKey: string,
  weekday: number,
  count: number,
) =>
  Array.from({ length: count * 7 }, (_, at) => shiftKey(todayKey, at + 1))
    .filter((key) => new Date(dayMs(key)).getUTCDay() === weekday)
    .slice(0, count);

type Subject = Pattern['subject'];

export const habitSubject = (id: string, windowId: string | null): Subject => ({
  collection: 'habits',
  id,
  windowId,
  otherId: null,
});

/** A finding made by hand, with its signature and handling worked out the way the detectors do. */
export const toSeedFinding = (
  input: Pick<
    PatternFinding,
    'kind' | 'subject' | 'bucket' | 'evidence' | 'effect' | 'lastEvidenceAt'
  > &
    Partial<Pick<PatternFinding, 'parts' | 'isCare' | 'tags' | 'linkedTo'>>,
): PatternFinding => ({
  parts: [],
  isCare: false,
  tags: [],
  linkedTo: null,
  ...input,
  effect: input.isCare ? { kind: 'none' } : input.effect,
  signature: patternSignature({ ...input, parts: input.parts ?? [] }),
  handling: readHandling(input.kind, input.subject, input.isCare ?? false),
});

export interface SeedPattern {
  id: string;
  pattern: Pattern;
}

/** A pattern as stored: the finding's readable fields, its two lines sealed, and whatever state the seed wants it in. */
export const toSeedPattern = async (
  finding: PatternFinding,
  input: {
    name: string;
    now: number;
    privacy?: 'ordinary' | 'private';
    overrides?: Partial<Omit<Pattern, 'sealed'>>;
  },
  encryption: HelmEncryption,
): Promise<SeedPattern> => ({
  id: patternDocId(finding),
  pattern: {
    ...toPatternFields(finding, {
      now: input.now,
      privacy: input.privacy ?? 'ordinary',
    }),
    ...input.overrides,
    sealed: await sealJson<PatternSealed>(
      {
        ...buildPatternLines({ finding, name: input.name }),
        reasonLine: null,
      },
      encryption,
    ),
  },
});

export interface SeedObservation {
  id: string;
  observation: Observation;
}

export const toSeedObservation = async (
  input: {
    id: string;
    subject: Observation['subject'];
    dayKey: string;
    time: string;
    source: Observation['source'];
    sourceKey: string;
    isCare?: boolean;
    privacy?: 'ordinary' | 'private';
    kind: ObservationSealed['kind'];
    tags: ObservationTag[];
    quote: string | null;
  },
  encryption: HelmEncryption,
): Promise<SeedObservation> => {
  const at = zonedDateTimeToEpoch(input.dayKey, input.time, LEARNING_ZONE);
  return {
    id: input.id,
    observation: {
      subject: input.subject,
      dayKey: input.dayKey,
      at,
      source: input.source,
      sourceKeys: [input.sourceKey],
      isCare: input.isCare ?? false,
      writtenBy: 'turn',
      createdAt: at,
      privacy: input.privacy ?? 'ordinary',
      sealed: await sealJson<ObservationSealed>(
        { kind: input.kind, tags: input.tags, quote: input.quote },
        encryption,
      ),
    },
  };
};

export interface SeedReflection {
  id: string;
  reflection: Reflection;
}

export const toSeedReflection = async (
  input: {
    dayKey: string;
    reflectionId: string;
    seenAt: number | null;
    sourceKeys: string[];
    createdAt: number;
    sealed: ReflectionSealed;
  },
  encryption: HelmEncryption,
): Promise<SeedReflection> => ({
  id: input.dayKey,
  reflection: {
    dayKey: input.dayKey,
    reflectionId: input.reflectionId,
    candidateCount: input.sealed.candidates.length,
    seenAt: input.seenAt,
    sourceKeys: input.sourceKeys,
    createdAt: input.createdAt,
    privacy: 'ordinary',
    sealed: await sealJson<ReflectionSealed>(input.sealed, encryption),
  },
});

/** The execution an act-and-tell pattern points at, so its Undo has something to take back. */
export const toSeedActExecution = async (
  input: {
    patternId: string;
    summary: string;
    now: number;
  },
  encryption: HelmEncryption,
): Promise<Execution> => ({
  captureId: null,
  actor: 'nomos',
  via: null,
  category: 'plan',
  autonomyLevel: 2,
  state: 'succeeded',
  effectRefs: [
    { op: 'create', collection: 'patterns', docId: input.patternId },
  ],
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  undoneDocIds: null,
  partUndoIds: null,
  questionRef: null,
  errorCode: null,
  privacy: 'ordinary',
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
          previous: null,
        },
      ],
      undoReport: null,
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

export interface SeedSeenAs {
  id: string;
  line: SeenAsLine;
}

/** One line of how the assistant sees the person, with its id and basis worked out the way the server does. */
export const toSeedSeenAs = async (
  input: {
    kind: SeenAsKind;
    claim: string;
    state?: SeenAsState;
    corrected?: string;
    sourceKeys: string[];
    subjectRefs?: string[];
    derivedAt: number;
    changedAt?: number;
  },
  encryption: HelmEncryption,
): Promise<SeedSeenAs> => {
  const state = input.state ?? 'shown';
  const hash = createHash('sha256')
    .update(seenAsIdInput(input.kind, input.claim))
    .digest('hex')
    .slice(0, 24);
  return {
    id: `sa_${hash}`,
    line: {
      kind: input.kind,
      state,
      sourceKeys: input.sourceKeys,
      subjectRefs: input.subjectRefs ?? [],
      writtenBy: 'reflection',
      dontDrawFrom: state === 'removed' ? input.sourceKeys : [],
      derivedAt: input.derivedAt,
      correctedAt: state === 'corrected' ? (input.changedAt ?? null) : null,
      removedAt: state === 'removed' ? (input.changedAt ?? null) : null,
      privacy: null,
      createdAt: input.derivedAt,
      sealed: await sealJson<SeenAsSealed>(
        {
          line: state === 'removed' ? normaliseClaim(input.claim) : input.claim,
          basis: buildSeenAsBasis(input.sourceKeys),
          corrected: state === 'corrected' ? (input.corrected ?? null) : null,
        },
        encryption,
      ),
    },
  };
};

const GUITAR = 'seed-habit-guitar';
const STRETCH = 'seed-habit-stretch';
const PILLS = 'seed-habit-pills';

/** What Helm has noticed for Alex: two weeks of what was said (guitar felt hard on three days, stretching felt good on three, a check-in note, one about the day), one pattern in every state (asking on the guitar habit, asking about the pills in a question's words, not yet asked, changed on its own for this weekday's evening, not now, stopped, no longer true) and last night's unseen reflection linking the guitar days to busy days. */
export async function buildLearning(input: {
  now: number;
  todayKey: string;
  encryption: HelmEncryption;
}) {
  const { now, todayKey, encryption } = input;
  const weekday = new Date(dayMs(todayKey)).getUTCDay();
  const subject = (id: string) => ({
    collection: 'habits' as const,
    id,
  });
  const note = (
    id: string,
    habit: string,
    back: number,
    time: string,
    kind: ObservationSealed['kind'],
    tags: ObservationTag[],
    quote: string,
    source: Observation['source'] = 'turn',
  ) =>
    toSeedObservation(
      {
        id,
        subject: subject(habit),
        dayKey: shiftKey(todayKey, back),
        time,
        source,
        sourceKey:
          source === 'checkInNote'
            ? `habitDays/${shiftKey(todayKey, back)}#${habit}/e`
            : `captures/${id}`,
        kind,
        tags,
        quote,
      },
      encryption,
    );
  const observations = await Promise.all([
    note(
      'seed-obs-guitar-1',
      GUITAR,
      12,
      '21:10',
      'feeling',
      ['tired'],
      'too tired tonight',
    ),
    note(
      'seed-obs-guitar-2',
      GUITAR,
      9,
      '20:40',
      'reason',
      ['tooBusy'],
      'so busy today, barely touched it',
    ),
    note(
      'seed-obs-guitar-3',
      GUITAR,
      5,
      '21:25',
      'feeling',
      ['reluctant', 'tired'],
      "don't feel like it, I'm tired",
    ),
    note(
      'seed-obs-guitar-4',
      GUITAR,
      4,
      '19:50',
      'outcome',
      ['reluctant'],
      'practised, felt like a chore',
      'checkInNote',
    ),
    note(
      'seed-obs-stretch-1',
      STRETCH,
      10,
      '07:30',
      'feeling',
      ['enjoyed'],
      'that felt so good',
    ),
    note(
      'seed-obs-stretch-2',
      STRETCH,
      6,
      '07:20',
      'outcome',
      ['easy'],
      'easy one this morning',
    ),
    note(
      'seed-obs-stretch-3',
      STRETCH,
      2,
      '07:25',
      'feeling',
      ['proud', 'energised'],
      'proud I kept it going',
    ),
    toSeedObservation(
      {
        id: 'seed-obs-day-1',
        subject: { collection: 'day', id: null },
        dayKey: shiftKey(todayKey, 8),
        time: '22:05',
        source: 'turn',
        sourceKey: 'captures/seed-obs-day-1',
        kind: 'feeling',
        tags: ['tired'],
        quote: 'long day, no energy left',
      },
      encryption,
    ),
    toSeedObservation(
      {
        id: 'seed-obs-day-2',
        subject: { collection: 'day', id: null },
        dayKey: shiftKey(todayKey, 3),
        time: '21:40',
        source: 'turn',
        sourceKey: 'captures/seed-obs-day-2',
        kind: 'feeling',
        tags: ['proud'],
        quote: 'only three things today and I got all of them done',
      },
      encryption,
    ),
  ]);

  const missed = (keys: string[], count: number) => keys.slice(0, count);
  const occurrences = (keys: string[], matched: number, total: number) => ({
    kind: 'occurrences' as const,
    from: dayMs(keys[keys.length - 1]),
    to: dayMs(keys[0]),
    matched,
    total,
    dayKeys: missed(keys, matched),
  });
  const weekdayPart = (day: number) => ({
    kind: 'weekdayPart' as const,
    weekday: day as 0,
    part: 'evening' as const,
  });
  const tuesdays = lastWeekdayKeys(todayKey, 2, 5);
  const thursdays = lastWeekdayKeys(todayKey, 4, 5);
  const fridays = lastWeekdayKeys(todayKey, 5, 5);
  const wednesdays = lastWeekdayKeys(todayKey, 3, 5);
  const sameWeekdays = lastWeekdayKeys(todayKey, weekday, 6);
  const lastAt = (keys: string[]) => dayMs(keys[0]) + DAY_MS - 1;
  const said = (ids: string[], backs: number[]) => ({
    kind: 'said' as const,
    from: dayMs(shiftKey(todayKey, Math.max(...backs))),
    to: dayMs(shiftKey(todayKey, Math.min(...backs))),
    matched: backs.length,
    dayKeys: backs.map((back) => shiftKey(todayKey, back)),
    observationIds: ids,
  });
  const history = (to: Pattern['state'], at: number) => [
    { to: 'candidate' as const, at: at - DAY_MS, by: 'nomos' as const },
    { to, at, by: 'nomos' as const },
  ];

  const guitarTuesday = toSeedFinding({
    kind: 'windowMissed',
    subject: habitSubject(GUITAR, 'e'),
    bucket: weekdayPart(2),
    evidence: occurrences(tuesdays, 4, 5),
    effect: { kind: 'talkItThrough', start: 'differentTime' },
    lastEvidenceAt: lastAt(tuesdays),
  });
  const pillsWednesday = toSeedFinding({
    kind: 'windowMissed',
    subject: habitSubject(PILLS, 'e'),
    bucket: weekdayPart(3),
    evidence: occurrences(wednesdays, 4, 5),
    effect: { kind: 'none' },
    isCare: true,
    lastEvidenceAt: lastAt(wednesdays),
  });
  const stretchWorking = toSeedFinding({
    kind: 'saidWorking',
    subject: habitSubject(STRETCH, null),
    bucket: { kind: 'none' },
    evidence: said(
      ['seed-obs-stretch-1', 'seed-obs-stretch-2', 'seed-obs-stretch-3'],
      [10, 6, 2],
    ),
    effect: { kind: 'keepTime', habitId: STRETCH, windowId: 'm' },
    tags: ['enjoyed', 'easy', 'proud'],
    lastEvidenceAt: now - 2 * DAY_MS,
  });
  const eveningEmpty = toSeedFinding({
    kind: 'plannedSlotMissed',
    subject: { collection: 'planner', id: null, windowId: null, otherId: null },
    bucket: weekdayPart(weekday),
    evidence: occurrences(sameWeekdays, 5, 6),
    effect: { kind: 'plannerAvoid', bucket: weekdayPart(weekday) },
    lastEvidenceAt: lastAt(sameWeekdays),
  });
  const guitarThursday = toSeedFinding({
    kind: 'windowMissed',
    subject: habitSubject(GUITAR, 'e'),
    bucket: weekdayPart(4),
    evidence: occurrences(thursdays, 4, 5),
    effect: { kind: 'talkItThrough', start: 'differentTime' },
    lastEvidenceAt: lastAt(thursdays),
  });
  const stretchEarlier = toSeedFinding({
    kind: 'doneOutsideWindow',
    subject: habitSubject(STRETCH, 'm'),
    bucket: { kind: 'none' },
    parts: ['before'],
    evidence: occurrences(lastWeekdayKeys(todayKey, 1, 6), 5, 6),
    effect: {
      kind: 'moveWindow',
      habitId: STRETCH,
      windowId: 'm',
      start: '06:30',
      end: '09:30',
    },
    lastEvidenceAt: now - 12 * DAY_MS,
  });
  const guitarFriday = toSeedFinding({
    kind: 'windowMissed',
    subject: habitSubject(GUITAR, 'e'),
    bucket: weekdayPart(5),
    evidence: occurrences(fridays, 4, 5),
    effect: { kind: 'talkItThrough', start: 'differentTime' },
    lastEvidenceAt: lastAt(fridays),
  });

  const evening = await toSeedPattern(
    eveningEmpty,
    { name: 'Alex', now: now - 3 * DAY_MS, overrides: {} },
    encryption,
  );
  const executionId = 'seed-exec-pattern-evening';
  const acted: SeedPattern = {
    id: evening.id,
    pattern: {
      ...evening.pattern,
      state: 'accepted',
      acceptedBy: 'auto',
      executionId,
      stateAt: now - 2 * 60 * 60_000,
      history: history('accepted', now - 2 * 60 * 60_000),
    },
  };
  const patterns = [
    await toSeedPattern(
      guitarTuesday,
      {
        name: 'Practice guitar',
        now: now - 5 * DAY_MS,
        overrides: {
          state: 'suggested',
          stateAt: now - 4 * DAY_MS,
          history: history('suggested', now - 4 * DAY_MS),
        },
      },
      encryption,
    ),
    await toSeedPattern(
      pillsWednesday,
      {
        name: 'Pills',
        now: now - 6 * DAY_MS,
        privacy: 'private',
        overrides: {
          state: 'suggested',
          stateAt: now - 2 * DAY_MS,
          history: history('suggested', now - 2 * DAY_MS),
        },
      },
      encryption,
    ),
    await toSeedPattern(
      stretchWorking,
      { name: 'Stretch for ten minutes', now: now - 2 * DAY_MS },
      encryption,
    ),
    acted,
    await toSeedPattern(
      guitarThursday,
      {
        name: 'Practice guitar',
        now: now - 40 * DAY_MS,
        overrides: {
          state: 'declined',
          declineCount: 1,
          nextEligibleOn: dayMs(shiftKey(todayKey, -18)),
          evidenceSince: now - 10 * DAY_MS,
          stateAt: now - 10 * DAY_MS,
          history: history('declined', now - 10 * DAY_MS),
        },
      },
      encryption,
    ),
    await toSeedPattern(
      stretchEarlier,
      {
        name: 'Stretch for ten minutes',
        now: now - 60 * DAY_MS,
        overrides: {
          state: 'declined',
          declineCount: 1,
          offReason: 'askedToStop',
          offAt: now - 30 * DAY_MS,
          isLive: false,
          stateAt: now - 30 * DAY_MS,
          history: history('declined', now - 30 * DAY_MS),
        },
      },
      encryption,
    ),
    await toSeedPattern(
      guitarFriday,
      {
        name: 'Practice guitar',
        now: now - 50 * DAY_MS,
        overrides: {
          state: 'retired',
          isLive: false,
          stateAt: now - 20 * DAY_MS,
          history: history('retired', now - 20 * DAY_MS),
        },
      },
      encryption,
    ),
  ];
  const weddingDay = dayMs(shiftKey(todayKey, -3));
  const busyFrom = dayMs(shiftKey(todayKey, -1));
  const guardrailReasons = [
    {
      kind: 'deadlineWontFit' as const,
      evidence: {
        kind: 'load' as const,
        measured: 540,
        limit: 360,
        unit: 'minutes' as const,
        asOf: now,
        refs: ['seed-project-wedding', String(weddingDay)],
      },
    },
    {
      kind: 'busyStretch' as const,
      evidence: {
        kind: 'load' as const,
        measured: 3,
        limit: 5,
        unit: 'days' as const,
        asOf: now,
        refs: [String(busyFrom), String(weddingDay)],
      },
    },
  ];
  const guardrailLines = [
    'Wedding: 3 tasks due by Thursday need about 9h, and your calendar leaves about 6h.',
    '3 full days on your calendar through Thursday.',
  ];
  const guardrailSubject = {
    collection: 'projects' as const,
    id: 'seed-project-guitar-goal',
    windowId: null,
    otherId: null,
  };
  const guardrailFinding = toSeedFinding({
    kind: 'deadlineWontFit',
    subject: guardrailSubject,
    bucket: { kind: 'none' },
    evidence: guardrailReasons[0].evidence,
    effect: {
      kind: 'pause',
      collection: 'projects',
      id: guardrailSubject.id,
      until: dayMs(shiftKey(todayKey, -4)),
    },
    lastEvidenceAt: now,
  });
  const guardrail = await toSeedPattern(
    guardrailFinding,
    {
      name: 'Get back into guitar',
      now: now - 1 * DAY_MS,
      overrides: {
        moment: 'daily',
        reasons: guardrailReasons,
        state: 'suggested',
        stateAt: now - 60 * 60_000,
        history: history('suggested', now - 60 * 60_000),
      },
    },
    encryption,
  );
  guardrail.pattern.sealed = await sealJson<PatternSealed>(
    {
      statement: 'Pause Get back into guitar for a while?',
      evidenceLine: guardrailLines[0],
      reasonLine: guardrailLines.join('\n'),
    },
    encryption,
  );
  patterns.push(guardrail);
  const holdSubject = {
    collection: 'projects' as const,
    id: 'seed-project-spare-room',
    windowId: null,
    otherId: 'seed-project-spare-room',
  };
  const goalsEvidence = {
    kind: 'load' as const,
    measured: 3,
    limit: 3,
    unit: 'goals' as const,
    asOf: now,
    refs: ['seed-project-guitar-goal'],
  };
  const holdLine = '3 goals already going, including Get back into guitar.';
  const hold = await toSeedPattern(
    toSeedFinding({
      kind: 'tooManyGoals',
      subject: holdSubject,
      bucket: { kind: 'none' },
      evidence: goalsEvidence,
      effect: {
        kind: 'pause',
        collection: 'projects',
        id: holdSubject.id,
        until: null,
      },
      lastEvidenceAt: now,
    }),
    {
      name: 'Paint the spare room',
      now: now - 1 * DAY_MS,
      overrides: {
        moment: 'onStart',
        reasons: [{ kind: 'tooManyGoals', evidence: goalsEvidence }],
        state: 'suggested',
        stateAt: now - 30 * 60_000,
        history: history('suggested', now - 30 * 60_000),
      },
    },
    encryption,
  );
  hold.pattern.sealed = await sealJson<PatternSealed>(
    {
      statement: 'Maybe hold Paint the spare room for a while?',
      evidenceLine: holdLine,
      reasonLine: holdLine,
    },
    encryption,
  );
  patterns.push(hold);
  const calendarKey = new Date(now).toLocaleDateString('en-CA', {
    timeZone: LEARNING_ZONE,
  });
  const taskDay = dayMs(shiftKey(calendarKey, -2));
  const taskSubject = {
    collection: 'tasks' as const,
    id: 'seed-task-3-1',
    windowId: null,
    otherId: 'seed-task-3-1',
  };
  const taskEvidence = {
    kind: 'load' as const,
    measured: 420,
    limit: 240,
    unit: 'minutes' as const,
    asOf: now,
    refs: [taskSubject.id, String(taskDay)],
  };
  const taskLine = 'Due in two days: about 7h of work, 4h free before then.';
  const taskGuardrail = await toSeedPattern(
    toSeedFinding({
      kind: 'deadlineWontFit',
      subject: taskSubject,
      bucket: { kind: 'none' },
      evidence: taskEvidence,
      effect: { kind: 'none' },
      lastEvidenceAt: now,
    }),
    {
      name: 'Task',
      now: now - 1 * DAY_MS,
      overrides: {
        moment: 'onStart',
        reasons: [{ kind: 'deadlineWontFit', evidence: taskEvidence }],
        state: 'suggested',
        stateAt: now - 20 * 60_000,
        history: history('suggested', now - 20 * 60_000),
      },
    },
    encryption,
  );
  taskGuardrail.pattern.sealed = await sealJson<PatternSealed>(
    {
      statement: `${new Date(taskDay).toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: 'UTC',
      })} looks full for Call Grandpa about the wedding questions`,
      evidenceLine: taskLine,
      reasonLine: taskLine,
    },
    encryption,
  );
  patterns.push(taskGuardrail);
  const execution = await toSeedActExecution(
    {
      patternId: evening.id,
      summary: 'Left this evening empty',
      now: now - 2 * 60 * 60_000,
    },
    encryption,
  );
  const guitarIds = [
    'seed-obs-guitar-1',
    'seed-obs-guitar-2',
    'seed-obs-guitar-3',
  ];
  const reflection = await toSeedReflection(
    {
      dayKey: shiftKey(todayKey, 1),
      reflectionId: 'seed-reflection-1',
      seenAt: null,
      sourceKeys: observations.map((one) => one.observation.sourceKeys[0]),
      createdAt: now - 9 * 60 * 60_000,
      sealed: {
        candidates: [
          {
            subject: { collection: 'habits', id: GUITAR },
            observationIds: guitarIds,
            tags: ['tired', 'tooBusy'],
            linkedTo: 'busyDay',
            suggestion: 'differentTime',
          },
        ],
        whyRefresh: [],
      },
    },
    encryption,
  );
  const patternKey = (at: number) => `patterns/${patterns[at].id}`;
  const obsKey = (id: string) => `observations/${id}`;
  const seenAs = await Promise.all([
    toSeedSeenAs(
      {
        kind: 'whatWorks',
        claim: 'Stretching holds up when it stays a morning thing',
        sourceKeys: [patternKey(2), `habits/${STRETCH}`],
        subjectRefs: [`habits/${STRETCH}`],
        derivedAt: now - 9 * DAY_MS,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'whatDoesnt',
        claim: 'Guitar has felt hard on weeknights',
        sourceKeys: guitarIds.map(obsKey),
        subjectRefs: [`habits/${GUITAR}`],
        derivedAt: now - 4 * DAY_MS,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'tendency',
        claim: 'Evenings get crowded: things planned after 7 PM slip more often',
        sourceKeys: [patternKey(0), patternKey(3)],
        derivedAt: now - 6 * DAY_MS,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'howYouTalk',
        claim: 'Short and warm; signs off “Cheers,”',
        sourceKeys: [
          'style/general#warm-but-brief',
          'style/general#signs-off-cheers',
        ],
        derivedAt: now - 11 * DAY_MS,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'tendency',
        claim: 'You keep going even when it feels like a chore',
        sourceKeys: [obsKey('seed-obs-guitar-4'), obsKey('seed-obs-stretch-3')],
        derivedAt: now - 3 * DAY_MS,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'rhythm',
        claim: 'Mornings are your steadiest stretch of the day',
        sourceKeys: [
          obsKey('seed-obs-stretch-1'),
          obsKey('seed-obs-stretch-2'),
          patternKey(2),
        ],
        subjectRefs: [`habits/${STRETCH}`],
        derivedAt: now - 5 * DAY_MS,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'whatWorks',
        claim: 'A short list beats a long one',
        state: 'corrected',
        corrected: 'A short list of three beats a long one',
        sourceKeys: [obsKey('seed-obs-day-2'), obsKey('seed-obs-day-1')],
        derivedAt: now - 8 * DAY_MS,
        changedAt: now - 24 * 60 * 60_000,
      },
      encryption,
    ),
    toSeedSeenAs(
      {
        kind: 'whatDoesnt',
        claim: 'Mondays are slow',
        state: 'removed',
        sourceKeys: [obsKey('seed-obs-guitar-1'), obsKey('seed-obs-stretch-2')],
        derivedAt: now - 10 * DAY_MS,
        changedAt: now - 2 * DAY_MS,
      },
      encryption,
    ),
  ]);
  return {
    patterns,
    observations,
    reflections: [reflection],
    executions: [{ id: executionId, execution }],
    seenAs,
  };
}

const SCALE_LIVE = 500;
const SCALE_OFF = 5000;
const SCALE_OBSERVATIONS = 2500;
const SCALE_REFLECTIONS = 14;
const SCALE_WEEKS = 26;
const PARTS = ['morning', 'midday', 'afternoon', 'evening', 'bedtime'] as const;
const SCALE_TAGS: ObservationTag[][] = [
  ['tired'],
  ['tooBusy'],
  ['reluctant', 'tired'],
  ['enjoyed'],
  ['easy', 'proud'],
  ['stressed'],
  ['madeProgress'],
];

/** A small seeded generator, so the scale run writes the same shapes every time. */
const makeCounter = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return value / 4_294_967_296;
  };
};

/** Morgan's lifetime of learning: 500 live patterns, 5,000 gone off (the stopped ones cut to their signature), about 2,500 observations over 26 weeks, 14 reflections, three of them unseen, and the 40 lines of how Helm sees them that a person keeps (30 shown, 4 corrected, 6 removed). */
export async function buildLearningScale(input: {
  now: number;
  todayKey: string;
  encryption: HelmEncryption;
  habits: { id: string; isCare: boolean; windowIds: string[] }[];
}) {
  const { now, todayKey, encryption, habits } = input;
  const next = makeCounter(20_261_112);
  const between = (low: number, high: number) =>
    low + Math.floor(next() * (high - low + 1));
  const emptyLines = await sealJson<PatternSealed>(
    { statement: '', evidenceLine: '', reasonLine: null },
    encryption,
  );

  const observations = await Promise.all(
    Array.from({ length: SCALE_OBSERVATIONS }, async (_, index) => {
      const habit = habits[index % habits.length];
      const back = between(0, SCALE_WEEKS * 7 - 1);
      const tags = SCALE_TAGS[index % SCALE_TAGS.length];
      return toSeedObservation(
        {
          id: `scale-obs-${String(index).padStart(4, '0')}`,
          subject: { collection: 'habits', id: habit.id },
          dayKey: shiftKey(todayKey, back),
          time: `${String(between(7, 22)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}`,
          source: index % 3 === 0 ? 'checkInNote' : 'turn',
          sourceKey: `captures/scale-obs-${index}`,
          isCare: habit.isCare,
          privacy: habit.isCare ? 'private' : 'ordinary',
          kind: 'feeling',
          tags,
          quote: habit.isCare ? null : 'a few words about how it went',
        },
        encryption,
      );
    }),
  );

  const patterns = await Promise.all(
    Array.from({ length: SCALE_LIVE + SCALE_OFF }, async (_, index) => {
      const habit = habits[index % habits.length];
      const windowId =
        habit.windowIds[index % Math.max(1, habit.windowIds.length)] ?? null;
      const isLive = index < SCALE_LIVE;
      const part = PARTS[index % PARTS.length];
      const weekday = Math.floor(index / PARTS.length) % 7;
      const keys = lastWeekdayKeys(todayKey, weekday, 5);
      const finding = toSeedFinding({
        kind: 'windowMissed',
        subject: habitSubject(habit.id, windowId),
        bucket: { kind: 'weekdayPart', weekday: weekday as 0, part },
        parts: [`scale${index}`],
        isCare: habit.isCare,
        evidence: {
          kind: 'occurrences',
          from: dayMs(keys[keys.length - 1]),
          to: dayMs(keys[0]),
          matched: 4,
          total: 5,
          dayKeys: keys.slice(0, 4),
        },
        effect: { kind: 'talkItThrough', start: 'differentTime' },
        lastEvidenceAt: now - between(1, SCALE_WEEKS * 7) * DAY_MS,
      });
      const at = now - between(1, SCALE_WEEKS * 7) * DAY_MS;
      const entry = await toSeedPattern(
        finding,
        {
          name: `Habit ${(index % habits.length) + 1}`,
          now: at,
          privacy: habit.isCare ? 'private' : 'ordinary',
          overrides: isLive
            ? {
                state: (
                  ['candidate', 'suggested', 'accepted', 'declined'] as const
                )[index % 4],
                stateAt: at,
              }
            : index % 2 === 0
              ? {
                  state: 'declined',
                  declineCount: 2,
                  offReason: 'thirdNo',
                  offAt: at,
                  isLive: false,
                  stateAt: at,
                  evidence: {
                    kind: 'occurrences',
                    from: 0,
                    to: 0,
                    matched: 0,
                    total: 0,
                    dayKeys: [],
                  },
                  sourceKeys: [],
                  reasons: [],
                  history: [],
                }
              : { state: 'retired', isLive: false, offAt: at, stateAt: at },
        },
        encryption,
      );
      return index % 2 === 0 && !isLive
        ? { ...entry, pattern: { ...entry.pattern, sealed: emptyLines } }
        : entry;
    }),
  );

  const reflections = await Promise.all(
    Array.from({ length: SCALE_REFLECTIONS }, (_, index) => {
      const habit = habits[index % habits.length];
      const cited = observations
        .filter(
          (one) =>
            one.observation.subject.id === habit.id &&
            one.observation.dayKey >= shiftKey(todayKey, 13),
        )
        .slice(0, 3)
        .map((one) => one.id);
      return toSeedReflection(
        {
          dayKey: shiftKey(todayKey, index),
          reflectionId: `scale-reflection-${index}`,
          seenAt: index < 3 ? null : now - (index - 2) * DAY_MS,
          sourceKeys: cited.map((id) => `captures/${id}`),
          createdAt: now - index * DAY_MS - 6 * 60 * 60_000,
          sealed: {
            candidates: habit.isCare
              ? []
              : [
                  {
                    subject: { collection: 'habits', id: habit.id },
                    observationIds: cited,
                    tags: ['tired'],
                    linkedTo: 'other',
                    suggestion: 'differentTime',
                  },
                ],
            whyRefresh: [],
          },
        },
        encryption,
      );
    }),
  );
  const scaleKinds = [
    'whatWorks',
    'whatDoesnt',
    'rhythm',
    'howYouTalk',
    'tendency',
  ] as const satisfies SeenAsKind[];
  const scaleStems: Record<SeenAsKind, string> = {
    whatWorks: 'A reminder at this hour works',
    whatDoesnt: 'This part of the week gets in the way',
    rhythm: 'This stretch of the day runs steady',
    howYouTalk: 'This way of putting things comes up',
    tendency: 'This kind of plan tends to slip',
  };
  const scaleHabits = habits.filter((habit) => !habit.isCare);
  const seenAs = await Promise.all(
    Array.from({ length: SEEN_AS_LIMITS.records }, (_, index) => {
      const kind = scaleKinds[index % scaleKinds.length];
      const habit = scaleHabits[index % scaleHabits.length];
      const first = (index * 7) % SCALE_OBSERVATIONS;
      const second = (first + habits.length) % SCALE_OBSERVATIONS;
      const key = (at: number) =>
        `observations/scale-obs-${String(at).padStart(4, '0')}`;
      const state: SeenAsState =
        index < 30 ? 'shown' : index < 34 ? 'corrected' : 'removed';
      return toSeedSeenAs(
        {
          kind,
          claim: `${scaleStems[kind]} (${index + 1})`,
          state,
          corrected: `${scaleStems[kind]}, in my words (${index + 1})`,
          sourceKeys: [key(first), key(second)],
          subjectRefs: [`habits/${habit.id}`],
          derivedAt: now - (index + 1) * DAY_MS,
          changedAt: now - (index + 1) * DAY_MS + 3_600_000,
        },
        encryption,
      );
    }),
  );
  return { patterns, observations, reflections, seenAs };
}
