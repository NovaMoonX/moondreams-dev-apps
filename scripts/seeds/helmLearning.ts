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
} from '../../src/apps/helm/types.ts';

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
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    },
    encryption,
  ),
});

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
  return {
    patterns,
    observations,
    reflections: [reflection],
    executions: [{ id: executionId, execution }],
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

/** Morgan's lifetime of learning: 500 live patterns, 5,000 gone off (the stopped ones cut to their signature), about 2,500 observations over 26 weeks and 14 reflections, three of them unseen. */
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
  return { patterns, observations, reflections };
}
