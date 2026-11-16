import { createHash } from 'node:crypto';

import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { isPrivateHabit } from '../habitStore.js';
import { openForHelm, sealForHelm, type HelmKey } from '../helmKey.js';
import {
  buildSeenAsBasis,
  checkSeenAsCandidates,
  cutSeenAsLine,
  planSeenAsRebuild,
  SEEN_AS_KINDS,
  SEEN_AS_LIMITS,
  seenAsIdInput,
  type SeenAsCandidate,
  type SeenAsKind,
} from '../nomos/seenAs.js';
import {
  readDerivedPrivacy,
  readPrivacy,
  maskPrivateNames,
  type PrivacyClass,
} from '../privacy.js';
import { toSeenAsRecord, type SeenAsRecord } from '../seenAsStore.js';
import { toStyleWords } from '../styleLearner.js';
import type { Read, ReflectWindow } from './readReflectWindow.js';

const MAX_PATTERNS = 50;
const MAX_STYLE_DOCS = 20;
const MAX_STYLE_NOTES = 20;
const MAX_HABIT_STAGES = 30;
const MAX_ALIASES = 30;
const MAX_LIVE_READS = 300;
const SOMEONE = 'someone';

/** What a rebuild may add to the output on top of the reflection's own cap. */
export const SEE_YOU_MAX_TOKENS = 1100;

export const SEE_YOU_SYSTEM = `seeYou: at most ${SEEN_AS_LIMITS.returned} short lines about how this person tends to work or talk, which the assistant uses only to shape its tone and suggestions and never says back. Each has a kind (${SEEN_AS_KINDS.join(', ')}), a line of at most ${SEEN_AS_LIMITS.line} characters in plain words to the person ("You get piano done on mornings you've slept well"), sources (the codes of ${SEEN_AS_LIMITS.minSources} or more different things it rests on: observations o…, patterns p…, habits h…, style notes s…), about (the habit or goal codes it is about, empty when none) and isAboutHealth (true when it touches the body, a medicine, a mood or a diagnosis).
A line needs two or more different sources and describes something that repeats, never one moment. Never write a judgement about the body, a diagnosis or a guess at why they do something. <the_person_says> holds lines the person has corrected: never contradict one or say it again in other words. Never write a person's name. An empty list is a good answer.`;

export const SEE_YOU_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'line', 'sources', 'about', 'isAboutHealth'],
    properties: {
      kind: { enum: [...SEEN_AS_KINDS] },
      line: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' } },
      about: { type: 'array', items: { type: 'string' } },
      isAboutHealth: { type: 'boolean' },
    },
  },
} as const;

export interface SeeYouLine {
  kind: SeenAsKind;
  line: string;
  sources: string[];
  about: string[];
  isAboutHealth: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toAliasList = (value: unknown) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      ].slice(0, MAX_ALIASES)
    : [];

const toSeeYouLine = (value: unknown): SeeYouLine[] => {
  if (!isRecord(value)) return [];
  const kind = SEEN_AS_KINDS.find((entry) => entry === value.kind);
  const line = typeof value.line === 'string' ? cutSeenAsLine(value.line) : '';
  if (!kind || line === '') return [];
  return [
    {
      kind,
      line,
      sources: toAliasList(value.sources),
      about: toAliasList(value.about),
      isAboutHealth: value.isAboutHealth !== false,
    },
  ];
};

/** The model's lines, shape and caps checked; null when the answer has no list of them, which is how a night that did not ask is told from one that asked and got nothing. */
export const normalizeSeeYou = (value: unknown): SeeYouLine[] | null =>
  Array.isArray(value)
    ? value.flatMap(toSeeYouLine).slice(0, SEEN_AS_LIMITS.returned)
    : null;

export interface SeeYouPattern {
  id: string;
  kind: string;
  subject: DocumentData;
  state: string;
  statement: string | null;
  isPrivate: boolean;
  at: number;
}

export interface SeeYouStyleNote {
  /** `'{scope}#{traitKey}'`. */
  ref: string;
  text: string;
  at: number;
}

/** What a rebuild reads besides the window: the shown patterns, the general style notes, and the lines already kept. */
export interface SeeYouWorld {
  patterns: SeeYouPattern[];
  style: SeeYouStyleNote[];
  /** Every style note there is, for whether a corrected line's source is still there. */
  styleRefs: Set<string>;
  existing: SeenAsRecord[];
}

const openStatement = (key: HelmKey, sealed: unknown) => {
  try {
    const { statement } = openForHelm(key, sealed as SealedPayload);
    return typeof statement === 'string' ? statement : null;
  } catch {
    return null;
  }
};

const toTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Reads through the reader it is given, so a transaction can hold it. What was made at or before the person's last Forget is never read. */
export async function readSeeYouWorld(
  read: Read,
  firestore: Firestore,
  uid: string,
  key: HelmKey,
  forgottenAt: number | null,
): Promise<SeeYouWorld> {
  const base = `apps/helm/users/${uid}`;
  const after = forgottenAt ?? 0;
  const [patternSnap, styleSnap, seenAsSnap] = await Promise.all([
    read(
      firestore
        .collection(`${base}/patterns`)
        .where('isLive', '==', true)
        .limit(MAX_PATTERNS),
    ),
    read(firestore.collection(`${base}/style`).limit(MAX_STYLE_DOCS)),
    read(
      firestore.collection(`${base}/seenAs`).limit(SEEN_AS_LIMITS.records * 2),
    ),
  ]);
  const styleDocs = styleSnap.docs.flatMap((doc) => {
    try {
      const words = toStyleWords(
        openForHelm(key, doc.get('sealed') as SealedPayload),
      );
      return words
        ? [
            {
              scope: doc.id,
              isGeneral: doc.get('audienceWhoId') == null,
              at:
                toTime(doc.get('lastEditedAt')) || toTime(doc.get('createdAt')),
              traits: Object.entries(words.traits),
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  return {
    patterns: patternSnap.docs
      .filter(
        (doc) =>
          toTime(doc.get('createdAt')) > after &&
          doc.get('state') !== 'candidate',
      )
      .map((doc) => {
        const isPrivate = readPrivacy(doc.get('privacy')) === 'private';
        return {
          id: doc.id,
          kind: String(doc.get('kind')),
          subject: (doc.get('subject') ?? {}) as DocumentData,
          state: String(doc.get('state')),
          statement: isPrivate ? null : openStatement(key, doc.get('sealed')),
          isPrivate,
          at: toTime(doc.get('stateAt')) || toTime(doc.get('createdAt')),
        };
      }),
    style: styleDocs
      .filter((doc) => doc.isGeneral)
      .flatMap((doc) =>
        doc.traits.map(([traitKey, trait]) => ({
          ref: `${doc.scope}#${traitKey}`,
          text: trait.text,
          at: doc.at,
        })),
      )
      .slice(0, MAX_STYLE_NOTES),
    styleRefs: new Set(
      styleDocs.flatMap((doc) =>
        doc.traits.map(([traitKey]) => `${doc.scope}#${traitKey}`),
      ),
    ),
    existing: seenAsSnap.docs
      .flatMap((doc) => toSeenAsRecord(key, doc.id, doc.data()) ?? [])
      .filter((line) => line.createdAt > after),
  };
}

export const toPatternAlias = (uid: string, id: string) =>
  `p${createHash('sha256').update(`${uid}|p|${id}`).digest('hex').slice(0, 8)}`;
export const toStyleAlias = (uid: string, ref: string) =>
  `s${createHash('sha256').update(`${uid}|s|${ref}`).digest('hex').slice(0, 8)}`;
export const toObservationAlias = (uid: string, id: string) =>
  `o${createHash('sha256').update(`${uid}|o|${id}`).digest('hex').slice(0, 8)}`;
export const toHabitAlias = (uid: string, id: string) =>
  `h${createHash('sha256').update(`${uid}|h|${id}`).digest('hex').slice(0, 8)}`;
export const toGoalAlias = (uid: string, id: string) =>
  `g${createHash('sha256').update(`${uid}|g|${id}`).digest('hex').slice(0, 8)}`;

const toSomeone = (text: string, whoNames: string[]) =>
  maskPrivateNames(
    text,
    whoNames.map((name) => ({ name, label: SOMEONE })),
  );

const toDataJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

/** The blocks a rebuild adds to the message: aliases only, no name of another person, no words from anything private or care (a private correction included), and the person's corrections as "the person says". */
export function buildSeeYouBlocks(
  uid: string,
  window: ReflectWindow,
  world: SeeYouWorld,
): string[] {
  const { habits, goals, whoNames } = window;
  const aboutOf = (refs: string[]) =>
    refs.flatMap((ref) => {
      const [home, id] = ref.split('/');
      if (home === 'habits' && habits.has(id)) return [toHabitAlias(uid, id)];
      if (home === 'projects' && goals.has(id)) return [toGoalAlias(uid, id)];
      return [];
    });
  const aboutSubject = (subject: DocumentData) =>
    subject.collection === 'habits' && habits.has(String(subject.id))
      ? toHabitAlias(uid, String(subject.id))
      : subject.collection === 'projects' && goals.has(String(subject.id))
        ? toGoalAlias(uid, String(subject.id))
        : null;
  return [
    `<shown_patterns>${toDataJson(
      world.patterns.map((pattern) => ({
        id: toPatternAlias(uid, pattern.id),
        kind: pattern.kind,
        about: aboutSubject(pattern.subject),
        state: pattern.state,
        statement:
          pattern.statement === null
            ? null
            : toSomeone(pattern.statement, whoNames),
      })),
    )}</shown_patterns>`,
    `<habit_stages>${toDataJson(
      [...habits.values()]
        .filter((habit) => !isPrivateHabit(habit) && habit.stage !== null)
        .slice(0, MAX_HABIT_STAGES)
        .map((habit) => ({
          id: toHabitAlias(uid, habit.id),
          name: toSomeone(habit.name, whoNames),
          stage: habit.stage,
        })),
    )}</habit_stages>`,
    `<style_notes>${toDataJson(
      world.style.map((note) => ({
        id: toStyleAlias(uid, note.ref),
        text: toSomeone(note.text, whoNames),
      })),
    )}</style_notes>`,
    `<the_person_says>${toDataJson(
      world.existing.flatMap((line) =>
        line.state === 'corrected' &&
        line.privacy !== 'private' &&
        line.words?.corrected
          ? [
              {
                kind: line.kind,
                words: toSomeone(line.words.corrected, whoNames),
                about: aboutOf(line.subjectRefs),
              },
            ]
          : [],
      ),
    )}</the_person_says>`,
  ];
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export const toSeenAsId = (kind: SeenAsKind, line: string) =>
  `sa_${hash(seenAsIdInput(kind, line)).slice(0, 24)}`;

export interface SeeYouPlan {
  /** Lines written whole. */
  creates: { id: string; data: DocumentData }[];
  /** Corrected lines whose sources changed, and removed lines stripped to their id. */
  updates: { id: string; data: DocumentData }[];
  deletes: string[];
  counts: { asked: number; kept: number; refused: number };
}

interface PlanSeeYouInput {
  uid: string;
  now: number;
  key: HelmKey;
  window: ReflectWindow;
  world: SeeYouWorld;
  lines: SeeYouLine[];
  isSourceLive: (sourceKey: string) => boolean;
}

/** The model's lines checked against the person's records and the lines already kept: an alias that names nothing is dropped, and what is written, deleted or cut back is worked out by the contract's rules. */
export function planSeeYou(input: PlanSeeYouInput): SeeYouPlan {
  const { uid, now, key, window, world, lines, isSourceLive } = input;
  const { habits, goals, whoNames } = window;
  const observationsByAlias = new Map(
    window.observations.map((o) => [toObservationAlias(uid, o.id), o]),
  );
  const patternsByAlias = new Map(
    world.patterns.map((p) => [toPatternAlias(uid, p.id), p]),
  );
  const stylesByAlias = new Map(
    world.style.map((note) => [toStyleAlias(uid, note.ref), note]),
  );
  const habitsByAlias = new Map(
    [...habits.values()].map((habit) => [toHabitAlias(uid, habit.id), habit]),
  );
  const goalsByAlias = new Map(
    [...goals.keys()].map((id) => [toGoalAlias(uid, id), id]),
  );
  const resolve = (alias: string) => {
    const observation = observationsByAlias.get(alias);
    if (observation)
      return {
        key: `observations/${observation.id}`,
        at: observation.at,
        privacy: (observation.privacy === 'private' ||
        observation.isCare ||
        (observation.subject.collection === 'habits' &&
          habits.has(observation.subject.id ?? '') &&
          isPrivateHabit(habits.get(observation.subject.id ?? '')!))
          ? 'private'
          : 'ordinary') as PrivacyClass,
      };
    const pattern = patternsByAlias.get(alias);
    if (pattern)
      return {
        key: `patterns/${pattern.id}`,
        at: pattern.at,
        privacy: (pattern.isPrivate ? 'private' : 'ordinary') as PrivacyClass,
      };
    const habit = habitsByAlias.get(alias);
    if (habit)
      return {
        key: `habits/${habit.id}`,
        at: habit.lastEditedAt ?? habit.startsOn,
        privacy: (isPrivateHabit(habit)
          ? 'private'
          : 'ordinary') as PrivacyClass,
      };
    const style = stylesByAlias.get(alias);
    if (style)
      return {
        key: `style/${style.ref}`,
        at: style.at,
        privacy: 'ordinary' as PrivacyClass,
      };
    return null;
  };
  const resolved = lines.map((entry) => {
    const sources = entry.sources.flatMap((alias) => resolve(alias) ?? []);
    const subjectHabits = entry.about.flatMap((alias) => {
      const habit = habitsByAlias.get(alias);
      return habit ? [habit] : [];
    });
    const subjectRefs = [
      ...subjectHabits.map((habit) => `habits/${habit.id}`),
      ...entry.about.flatMap((alias) => {
        const id = goalsByAlias.get(alias);
        return id ? [`projects/${id}`] : [];
      }),
    ];
    const line = cutSeenAsLine(toSomeone(entry.line, whoNames));
    const candidate: SeenAsCandidate = {
      id: toSeenAsId(entry.kind, line),
      kind: entry.kind,
      line,
      sourceKeys: sources.map((source) => source.key),
      subjectRefs,
      isAboutHealth: entry.isAboutHealth || subjectHabits.some(isPrivateHabit),
      newestSourceAt: Math.max(0, ...sources.map((source) => source.at)),
    };
    return {
      candidate,
      privacy: readDerivedPrivacy(
        candidate.sourceKeys,
        (sourceKey) =>
          sources.find((source) => source.key === sourceKey)?.privacy,
      ),
    };
  });
  const { kept, refused } = checkSeenAsCandidates(
    resolved.map(({ candidate }) => candidate),
    world.existing,
  );
  const plan = planSeenAsRebuild(kept, world.existing, isSourceLive);
  const byId = new Map(world.existing.map((line) => [line.id, line]));
  const privacyOf = new Map(
    resolved.map(({ candidate, privacy }) => [candidate.id, privacy]),
  );
  return {
    creates: plan.write.map((candidate) => ({
      id: candidate.id,
      data: {
        kind: candidate.kind,
        state: 'shown',
        sourceKeys: candidate.sourceKeys,
        subjectRefs: candidate.subjectRefs,
        writtenBy: 'reflection',
        dontDrawFrom: [],
        derivedAt: now,
        correctedAt: null,
        removedAt: null,
        privacy: privacyOf.get(candidate.id) ?? 'ordinary',
        createdAt: byId.get(candidate.id)?.createdAt ?? now,
        sealed: sealForHelm(key, {
          line: candidate.line,
          basis: buildSeenAsBasis(candidate.sourceKeys),
          corrected: null,
        }),
      },
    })),
    updates: [
      ...plan.recite.flatMap((entry) => {
        const record = byId.get(entry.id);
        return record?.words
          ? [
              {
                id: entry.id,
                data: {
                  sourceKeys: entry.sourceKeys,
                  sealed: sealForHelm(key, {
                    ...record.words,
                    basis: entry.basis,
                  }),
                },
              },
            ]
          : [];
      }),
      ...plan.strip.map((id) => ({
        id,
        data: { sourceKeys: [], dontDrawFrom: [], sealed: null },
      })),
    ],
    // Lines were given and none passed: that may be a bad answer, so it never clears the lines already shown.
    deletes: lines.length > 0 && kept.length === 0 ? [] : plan.remove,
    counts: {
      asked: lines.length,
      kept: kept.length,
      refused: refused.length,
    },
  };
}

/** Whether each source a corrected line cites is still there: the window, the patterns and style notes already read, and a read of the rest (up to a cap, beyond which a source counts as there). */
export async function readSourceLiveness(
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  window: ReflectWindow,
  world: SeeYouWorld,
): Promise<(sourceKey: string) => boolean> {
  const base = `apps/helm/users/${uid}`;
  const known = new Set([
    ...window.observations.map((o) => `observations/${o.id}`),
    ...world.patterns.map((p) => `patterns/${p.id}`),
    ...[...window.habits.keys()].map((id) => `habits/${id}`),
    ...[...world.styleRefs].map((ref) => `style/${ref}`),
  ]);
  const wanted = [
    ...new Set(
      world.existing
        .filter((line) => line.state === 'corrected')
        .flatMap((line) => line.sourceKeys),
    ),
  ]
    .filter(
      (sourceKey) => !known.has(sourceKey) && !sourceKey.startsWith('style/'),
    )
    .slice(0, MAX_LIVE_READS);
  const snaps =
    wanted.length === 0
      ? []
      : await transaction.getAll(
          ...wanted.map((sourceKey) => firestore.doc(`${base}/${sourceKey}`)),
        );
  const gone = new Set([
    ...wanted.filter((_, index) => !snaps[index]?.exists),
    ...world.existing
      .filter((line) => line.state === 'corrected')
      .flatMap((line) => line.sourceKeys)
      .filter(
        (sourceKey) =>
          sourceKey.startsWith('style/') &&
          !world.styleRefs.has(sourceKey.slice('style/'.length)),
      ),
  ]);
  return (sourceKey) => !gone.has(sourceKey);
}

/** Reads what a rebuild needs inside the transaction, then plans it; every read is done before the caller writes. */
export async function planSeeYouIn(
  transaction: Transaction,
  firestore: Firestore,
  input: {
    uid: string;
    now: number;
    key: HelmKey;
    window: ReflectWindow;
    lines: SeeYouLine[];
    forgottenAt: number | null;
  },
): Promise<SeeYouPlan> {
  const { uid, now, key, window, lines, forgottenAt } = input;
  const world = await readSeeYouWorld(
    (query) => transaction.get(query),
    firestore,
    uid,
    key,
    forgottenAt,
  );
  const plan = planSeeYou({
    uid,
    now,
    key,
    window,
    world,
    lines,
    isSourceLive: await readSourceLiveness(
      transaction,
      firestore,
      uid,
      window,
      world,
    ),
  });
  const stored =
    plan.creates.length === 0
      ? []
      : await transaction.getAll(
          ...plan.creates.map(({ id }) =>
            firestore.doc(`apps/helm/users/${uid}/seenAs/${id}`),
          ),
        );
  const isTaken = new Set(
    stored
      .filter((snap) => snap.exists && snap.get('state') !== 'shown')
      .map((snap) => snap.id),
  );
  return {
    ...plan,
    creates: plan.creates.filter(({ id }) => !isTaken.has(id)),
    counts: { ...plan.counts, kept: plan.counts.kept - isTaken.size },
  };
}
