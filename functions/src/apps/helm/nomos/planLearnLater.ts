import type { SealedPayload } from '../../../appKeys/seal.js';
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { createOptionMatcher } from '../../../vendor/optionMatchUtils.js';
import type { LearnItem } from '../research/learnStore.js';
import { isOpenLearn } from '../research/learnStore.js';
import type {
  DeclineLearnCommand,
  LearnAsk,
  LearnCommand,
  RelatedLearnCommand,
  SaveForLaterCommand,
} from './commands.js';
import type {
  Effect,
  EffectRef,
  PlannedQuestion,
  QuestionStateEntry,
} from './executeCommands.js';
import {
  baseQuestion,
  buildHabitAnswerExecution,
  toPlannedQuestion,
} from './planHabitCommands.js';
import { buildQuestionsTaskQuestion } from './planQuestionsTask.js';

/** How many offered documents the profile remembers, the newest kept. */
export const OFFERED_DOCUMENTS_MAX = 50;

/** The offered document keys the profile holds, whatever else is in the field. */
export const readOfferedDocuments = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .filter((entry): entry is string => typeof entry === 'string')
    .slice(-OFFERED_DOCUMENTS_MAX);

/** The words the server writes for learn later, kept beside the planner; the device's own copies are in `HELM_COPY`. */
export const LEARN_WORDS = {
  saved: (subject: string) =>
    `Saved to learn later: ${subject}. I'll bring it up when you have a free half hour.`,
  merged: (subject: string) =>
    `Added that to what you wanted to learn about ${subject}.`,
  revived: (subject: string) => `${subject} is back on your learn later list.`,
  removed: (subject: string) => `Okay, I took ${subject} off your list.`,
  notNow: 'Okay, it stays on your list.',
  still: (subject: string) => `Do you still want to learn about ${subject}?`,
  keepIt: 'Keep it',
  removeIt: 'Remove it',
  together: (subject: string) => `Want these as one: ${subject}?`,
  togetherYes: 'Together',
  apart: 'Keep them apart',
  mergedTogether: (subject: string) => `Put those together as ${subject}.`,
  kindQuestion: (subject: string) =>
    `What would you like to do with ${subject}?`,
  read: 'Read up on it later',
  goal: 'Make it a goal you practise',
  goalOffer: (name: string) => `Make ${name} a goal?`,
  goalMade: (name: string) => `Made ${name} a goal.`,
  goalExists: (name: string) => `${name} is already one of your goals.`,
  yes: 'Yes',
  no: 'No',
  reworded: (subject: string) => `Okay, I'll put together ${subject} instead.`,
  busy: "I'm putting that overview together right now; ask again once it's in.",
  tooMuch: 'That was too much to change in one go',
};

const MORE_ASKED_MAX = 5;
const MORE_ASKED_CAP = 300;
const OFFERS_MAX = 10;
const NOT_NOW_STILL = 3;
const RELATED_LINE_MS = 28 * 86_400_000;
const NIGHT_TIME = '02:00';

const IGNORED_WORDS = new Set([
  'how',
  'what',
  'is',
  'the',
  'works',
  'work',
  'learn',
  'about',
]);

const matcher = createOptionMatcher<LearnItem>({
  names: (item) => [item.subject],
  ignoreWords: IGNORED_WORDS,
  ignoreTypedWords: IGNORED_WORDS,
  foldPlurals: true,
});

const toDayKey = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));

const addDay = (dayKey: string) =>
  new Date(Date.parse(`${dayKey}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/** The next 02:00 in the person's zone, strictly after now: when a saved question may be prepared. */
export const nextNight = (now: number, timeZone: string) => {
  const today = toDayKey(now, timeZone);
  const tonight = zonedDateTimeToEpoch(today, NIGHT_TIME, timeZone);
  return tonight > now
    ? tonight
    : zonedDateTimeToEpoch(addDay(today), NIGHT_TIME, timeZone);
};

const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The subject's matching item among those the person keeps: an open one first, then one they let go, which a wish said again revives. */
export function matchLearnSubject(subject: string, items: LearnItem[]) {
  const isLetGo = (item: LearnItem) =>
    item.status === 'dismissed' &&
    item.declineReason === 'lostInterest' &&
    item.mergedInto === null;
  return (
    matcher.match(subject, items.filter(isOpenLearn)) ??
    matcher.match(subject, items.filter(isLetGo))
  );
}

interface Draft {
  item: LearnItem;
  original: LearnItem;
  isNew: boolean;
  /** Fields the server writes that Undo never restores (when to prepare). */
  extra: Record<string, unknown>;
  isTouched: boolean;
}

const track = (item: LearnItem): Record<string, unknown> => ({
  status: item.status,
  notNowStreak: item.notNowStreak,
  declineReason: item.declineReason,
  offers: item.offers,
  relatedOfferedAt: item.relatedOfferedAt,
  mergedInto: item.mergedInto,
  removedAt: item.removedAt,
  'sealed.question': item.question,
  'sealed.subject': item.subject,
  'sealed.moreAsked': item.moreAsked,
  'sealed.overview': item.sealed.overview ?? null,
  'sealed.videos': item.sealed.videos ?? [],
  'sealed.searchQuery': item.sealed.searchQuery ?? null,
});

const pick = (values: Record<string, unknown>, paths: string[]) =>
  Object.fromEntries(paths.map((path) => [path, values[path]]));

const toEffect = (before: LearnItem, after: LearnItem): Effect | null => {
  const was = track(before);
  const now = track(after);
  const own = Object.keys(now).filter(
    (path) => JSON.stringify(was[path]) !== JSON.stringify(now[path]),
  );
  return own.length === 0
    ? null
    : {
        written: { ...pick(now, own), 'sealed.title': after.subject },
        previous: { ...pick(was, own), 'sealed.title': after.subject },
      };
};

const setWords = (
  item: LearnItem,
  patch: {
    question?: string;
    subject?: string;
    moreAsked?: string[];
    overview?: unknown;
    videos?: unknown[];
    searchQuery?: string | null;
  },
): LearnItem => ({
  ...item,
  ...(patch.question !== undefined && { question: patch.question }),
  ...(patch.subject !== undefined && { subject: patch.subject }),
  ...(patch.moreAsked !== undefined && { moreAsked: patch.moreAsked }),
  sealed: {
    ...item.sealed,
    ...(patch.question !== undefined && { question: patch.question }),
    ...(patch.subject !== undefined && { subject: patch.subject }),
    ...(patch.moreAsked !== undefined && { moreAsked: patch.moreAsked }),
    ...(patch.overview !== undefined && { overview: patch.overview }),
    ...(patch.videos !== undefined && { videos: patch.videos }),
    ...(patch.searchQuery !== undefined && {
      searchQuery: patch.searchQuery,
    }),
  },
});

const addWords = (item: LearnItem, words: string[]) => {
  const seen = new Set(
    [item.question, ...item.moreAsked].map((text) => squash(text)),
  );
  const fresh = words
    .map((text) => text.slice(0, MORE_ASKED_CAP).trim())
    .filter((text, index, all) => {
      const key = squash(text);
      const isNew = key !== '' && !seen.has(key);
      seen.add(key);
      return isNew && all.indexOf(text) === index;
    });
  return [...item.moreAsked, ...fresh].slice(-MORE_ASKED_MAX);
};

/** One step of a plan: a saved question made, changed or asked about. */
type LearnOp =
  | LearnCommand
  | { kind: 'keepStill'; itemId: string }
  | {
      kind: 'together';
      olderId: string;
      newerId: string;
      together: string;
    };

export interface LearnPlan {
  creates: { id: string; doc: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
}

export interface LearnPlanInput {
  commands: LearnCommand[];
  asks: LearnAsk[];
  items: LearnItem[];
  isSpoken: boolean;
  /** A procedure is open or the turn answers a question, so a question about two saved items would interrupt. */
  isMidTask: boolean;
  timeZone: string;
  now: number;
  captureId: string;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn may still write. */
  room: number;
  /** The keys of the documents whose questions were already offered as a task. */
  offeredDocuments?: string[];
  /** The people the person has, to settle an offer's names to ids. */
  knownPeople?: { id: string; names: string[] }[];
}

interface Acc {
  drafts: Map<string, Draft>;
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
}

const heldQuestion = (
  kind: string,
  shape: 'pickOne' | 'yesNo',
  prompt: string,
  options: { id: string; label: string }[],
  held: Record<string, unknown>,
  allowsSomethingElse = false,
) => ({
  ...baseQuestion,
  kind,
  shape,
  prompt,
  options,
  allowsSomethingElse,
  heldCommands: [{ kind, ...held }],
});

const buildKindQuestion = (ask: LearnAsk) =>
  heldQuestion(
    'learnKind',
    'pickOne',
    LEARN_WORDS.kindQuestion(ask.subject),
    [
      { id: 'read', label: LEARN_WORDS.read },
      { id: 'goal', label: LEARN_WORDS.goal },
    ],
    {
      question: ask.question,
      subject: ask.subject,
      contextLine: ask.contextLine,
      needsLiveFacts: ask.needsLiveFacts,
      goalName: ask.goalName,
    },
    true,
  );

const buildGoalQuestion = (name: string) =>
  heldQuestion(
    'learnGoal',
    'yesNo',
    LEARN_WORDS.goalOffer(name),
    [
      { id: 'yes', label: LEARN_WORDS.yes },
      { id: 'no', label: LEARN_WORDS.no },
    ],
    { name },
  );

const buildStillQuestion = (item: LearnItem) =>
  heldQuestion(
    'learnStill',
    'pickOne',
    LEARN_WORDS.still(item.subject),
    [
      { id: 'keep', label: LEARN_WORDS.keepIt },
      { id: 'remove', label: LEARN_WORDS.removeIt },
    ],
    { researchId: item.id },
  );

const buildTogetherQuestion = (
  olderId: string,
  newerId: string,
  together: string,
) =>
  heldQuestion(
    'learnTogether',
    'pickOne',
    LEARN_WORDS.together(together),
    [
      { id: 'together', label: LEARN_WORDS.togetherYes },
      { id: 'apart', label: LEARN_WORDS.apart },
    ],
    { olderId, newerId, together },
  );

const isBusy = (item: LearnItem) => item.status === 'preparing';

const hasRoom = (acc: Acc, input: LearnPlanInput, needed: number) =>
  acc.effects.length + needed <= input.room;

const withDraft = (
  acc: Acc,
  draft: Draft,
  next: LearnItem,
  extra: Record<string, unknown> = {},
): Acc => {
  const effect = draft.isNew ? null : toEffect(draft.item, next);
  const drafts = new Map(acc.drafts);
  drafts.set(draft.item.id, {
    ...draft,
    item: next,
    extra: { ...draft.extra, ...extra },
    isTouched: true,
  });
  return {
    ...acc,
    drafts,
    effectRefs: effect
      ? [
          ...acc.effectRefs,
          { op: 'update', collection: 'research', docId: draft.item.id },
        ]
      : acc.effectRefs,
    effects: effect ? [...acc.effects, effect] : acc.effects,
  };
};

const withLine = (acc: Acc, line: string): Acc => ({
  ...acc,
  lines: [...acc.lines, line],
});

const withNotKept = (acc: Acc, line: string): Acc => ({
  ...acc,
  notKept: [...acc.notKept, line],
});

const planSave = (
  acc: Acc,
  command: SaveForLaterCommand,
  input: LearnPlanInput,
): Acc => {
  if (!hasRoom(acc, input, 1)) return withNotKept(acc, LEARN_WORDS.tooMuch);
  const matched = matchLearnSubject(
    command.subject,
    [...acc.drafts.values()].map((draft) => draft.item),
  );
  const draft = matched ? acc.drafts.get(matched.id) : undefined;
  if (!draft) {
    const id = input.newId();
    const item: LearnItem = {
      id,
      status: 'planned',
      question: command.question,
      subject: command.subject,
      moreAsked: [],
      contextLine: command.contextLine,
      notNowStreak: 0,
      declineReason: null,
      offers: [],
      relatedOfferedAt: {},
      mergedInto: null,
      removedAt: null,
      needsLiveFacts: command.needsLiveFacts,
      createdAt: input.now,
      sealed: {
        question: command.question,
        subject: command.subject,
        moreAsked: [],
        overview: null,
        sources: [],
        videos: [],
        searchQuery: null,
        contextLine: command.contextLine,
      },
    };
    const drafts = new Map(acc.drafts);
    drafts.set(id, {
      item,
      original: item,
      isNew: true,
      extra: { prepareAt: nextNight(input.now, input.timeZone) },
      isTouched: true,
    });
    return withLine(
      {
        ...acc,
        drafts,
        effectRefs: [
          ...acc.effectRefs,
          { op: 'create', collection: 'research', docId: id },
        ],
        effects: [
          ...acc.effects,
          { written: { 'sealed.title': command.subject }, previous: null },
        ],
      },
      LEARN_WORDS.saved(command.subject),
    );
  }
  const { item } = draft;
  const isLetGo = item.status === 'dismissed';
  const isReady = item.status === 'ready' || item.status === 'offered';
  const next: LearnItem = {
    ...setWords(item, {
      moreAsked: addWords(item, [command.question]),
    }),
    status: isLetGo || isReady ? 'planned' : item.status,
    declineReason: isLetGo ? null : item.declineReason,
    removedAt: isLetGo ? null : item.removedAt,
    notNowStreak: isLetGo ? 0 : item.notNowStreak,
    needsLiveFacts: item.needsLiveFacts || command.needsLiveFacts,
  };
  return withLine(
    withDraft(acc, draft, next, {
      needsLiveFacts: next.needsLiveFacts,
      ...(next.status === 'planned' && item.status !== 'planned'
        ? { prepareAt: nextNight(input.now, input.timeZone) }
        : {}),
    }),
    isLetGo
      ? LEARN_WORDS.revived(item.subject)
      : LEARN_WORDS.merged(item.subject),
  );
};

const planDecline = (
  acc: Acc,
  command: DeclineLearnCommand,
  input: LearnPlanInput,
): Acc => {
  const draft = acc.drafts.get(command.itemId);
  if (!draft || !isOpenLearn(draft.item)) return acc;
  if (!hasRoom(acc, input, 1)) return withNotKept(acc, LEARN_WORDS.tooMuch);
  const { item } = draft;
  if (command.reason === 'lostInterest') {
    return withLine(
      withDraft(acc, draft, {
        ...item,
        status: 'dismissed',
        declineReason: 'lostInterest',
        removedAt: input.now,
      }),
      LEARN_WORDS.removed(item.subject),
    );
  }
  if (command.reason === 'changedMind') {
    if (isBusy(item)) return withNotKept(acc, LEARN_WORDS.busy);
    const subject = command.subject ?? item.subject;
    const question = command.question ?? item.question;
    return withLine(
      withDraft(
        acc,
        draft,
        {
          ...setWords(item, {
            question,
            subject,
            moreAsked: [],
            overview: null,
            videos: [],
            searchQuery: null,
          }),
          status: 'planned',
          declineReason: 'changedMind',
        },
        { prepareAt: nextNight(input.now, input.timeZone) },
      ),
      LEARN_WORDS.reworded(subject),
    );
  }
  if (item.status !== 'ready' && item.status !== 'offered') return acc;
  const streak = item.notNowStreak + 1;
  const withStill = withLine(
    withDraft(acc, draft, {
      ...item,
      status: 'ready',
      notNowStreak: streak,
      declineReason: 'timing',
      offers: [
        ...item.offers,
        {
          at: input.now,
          dayKind: null,
          gapMinutes: null,
          afterBusyDay: null,
          outcome: 'notNow' as const,
        },
      ].slice(-OFFERS_MAX),
    }),
    LEARN_WORDS.notNow,
  );
  return streak >= NOT_NOW_STILL
    ? {
        ...withStill,
        questions: [
          ...withStill.questions,
          toPlannedQuestion(buildStillQuestion(item), {
            id: input.newId(),
            now: input.now,
          }),
        ],
      }
    : withStill;
};

const isOldPair = (first: LearnItem, second: LearnItem, now: number) =>
  [first.relatedOfferedAt[second.id], second.relatedOfferedAt[first.id]].every(
    (at) => at === undefined || now - at > RELATED_LINE_MS,
  );

const planRelated = (
  acc: Acc,
  command: RelatedLearnCommand,
  input: LearnPlanInput,
): Acc => {
  const first = acc.drafts.get(command.firstId);
  const second = acc.drafts.get(command.secondId);
  if (!first || !second) return acc;
  const isAllowed =
    isOpenLearn(first.item) &&
    isOpenLearn(second.item) &&
    isOldPair(first.item, second.item, input.now) &&
    !(input.isSpoken && input.isMidTask);
  if (!isAllowed || !hasRoom(acc, input, 2)) return acc;
  const [older, newer] =
    first.item.createdAt <= second.item.createdAt
      ? [first, second]
      : [second, first];
  const marked = (draft: Draft, otherId: string): LearnItem => ({
    ...draft.item,
    relatedOfferedAt: {
      ...draft.item.relatedOfferedAt,
      [otherId]: input.now,
    },
  });
  const afterFirst = withDraft(acc, first, marked(first, second.item.id));
  const afterSecond = withDraft(
    afterFirst,
    afterFirst.drafts.get(second.item.id) ?? second,
    marked(second, first.item.id),
  );
  return {
    ...afterSecond,
    questions: [
      ...afterSecond.questions,
      toPlannedQuestion(
        buildTogetherQuestion(older.item.id, newer.item.id, command.together),
        { id: input.newId(), now: input.now },
      ),
    ],
  };
};

const planKeepStill = (
  acc: Acc,
  itemId: string,
  input: LearnPlanInput,
): Acc => {
  const draft = acc.drafts.get(itemId);
  if (!draft || !isOpenLearn(draft.item) || !hasRoom(acc, input, 1)) return acc;
  return withDraft(acc, draft, { ...draft.item, notNowStreak: 0 });
};

const planTogether = (
  acc: Acc,
  op: Extract<LearnOp, { kind: 'together' }>,
  input: LearnPlanInput,
): Acc => {
  const older = acc.drafts.get(op.olderId);
  const newer = acc.drafts.get(op.newerId);
  if (
    !older ||
    !newer ||
    !isOpenLearn(older.item) ||
    !isOpenLearn(newer.item) ||
    !hasRoom(acc, input, 2)
  ) {
    return acc;
  }
  if (isBusy(older.item) || isBusy(newer.item)) {
    return withNotKept(acc, LEARN_WORDS.busy);
  }
  const folded: LearnItem = {
    ...setWords(older.item, {
      subject: op.together,
      moreAsked: addWords(older.item, [
        newer.item.question,
        ...newer.item.moreAsked,
      ]),
    }),
    status: 'planned',
  };
  const afterOlder = withDraft(acc, older, folded, {
    prepareAt: nextNight(input.now, input.timeZone),
    needsLiveFacts: older.item.needsLiveFacts || newer.item.needsLiveFacts,
  });
  return withLine(
    withDraft(afterOlder, newer, {
      ...newer.item,
      status: 'dismissed',
      mergedInto: older.item.id,
    }),
    LEARN_WORDS.mergedTogether(op.together),
  );
};

const toDoc = (draft: Draft, input: LearnPlanInput) => ({
  mode: 'learnLater',
  status: draft.item.status,
  depth: 'light',
  isWithoutWeb: !draft.item.needsLiveFacts,
  reservedCents: 0,
  captureId: input.captureId,
  projectId: null,
  searchesUsed: 0,
  costCents: 0,
  rerunOn: null,
  startedAt: null,
  preparedAt: null,
  cancelledAt: null,
  createdAt: input.now,
  lastEditedAt: null,
  prepareAt: draft.extra.prepareAt ?? null,
  needsLiveFacts: draft.item.needsLiveFacts,
  notNowStreak: draft.item.notNowStreak,
  declineReason: draft.item.declineReason,
  offeredOn: null,
  offers: draft.item.offers,
  relatedOfferedAt: draft.item.relatedOfferedAt,
  mergedInto: draft.item.mergedInto,
  videosFetchedAt: null,
  prepareFailedAt: null,
  resultNoteId: null,
  removedAt: draft.item.removedAt,
  sealed: input.seal(draft.item.sealed),
});

const toUpdate = (draft: Draft, input: LearnPlanInput) => {
  const was = track(draft.original);
  const now = track(draft.item);
  const readable = Object.keys(now).filter(
    (path) =>
      !path.startsWith('sealed.') &&
      JSON.stringify(was[path]) !== JSON.stringify(now[path]),
  );
  const isSealed = Object.keys(now).some(
    (path) =>
      path.startsWith('sealed.') &&
      JSON.stringify(was[path]) !== JSON.stringify(now[path]),
  );
  return {
    ...pick(now, readable),
    ...draft.extra,
    lastEditedAt: input.now,
    ...(isSealed && { sealed: input.seal(draft.item.sealed) }),
  };
};

const EMPTY: Omit<Acc, 'drafts'> = {
  effectRefs: [],
  effects: [],
  lines: [],
  notKept: [],
  questions: [],
};

/** Runs steps over the saved questions the person keeps and says what each writes: a question saved or merged into one it matches (or brought back), put off, let go, reworded, folded together or kept. Pure: the caller reads the items and writes the result. */
export function planLearnOps(input: LearnPlanInput, ops: LearnOp[]): LearnPlan {
  const step = (acc: Acc, op: LearnOp): Acc =>
    op.kind === 'saveForLater'
      ? planSave(acc, op, input)
      : op.kind === 'declineLearn'
        ? planDecline(acc, op, input)
        : op.kind === 'relatedLearn'
          ? planRelated(acc, op, input)
          : op.kind === 'keepStill'
            ? planKeepStill(acc, op.itemId, input)
            : op.kind === 'together'
              ? planTogether(acc, op, input)
              : acc;
  const done = ops.reduce(step, {
    ...EMPTY,
    drafts: new Map(
      input.items.map((item): [string, Draft] => [
        item.id,
        { item, original: item, isNew: false, extra: {}, isTouched: false },
      ]),
    ),
  });
  const touched = [...done.drafts.values()].filter((draft) => draft.isTouched);
  return {
    creates: touched
      .filter((draft) => draft.isNew)
      .map((draft) => ({ id: draft.item.id, doc: toDoc(draft, input) })),
    updates: touched
      .filter((draft) => !draft.isNew)
      .map((draft) => ({ id: draft.item.id, data: toUpdate(draft, input) })),
    effectRefs: done.effectRefs,
    effects: done.effects,
    lines: done.lines,
    notKept: done.notKept,
    questions: done.questions,
  };
}

/** Plans a turn's learn-later commands: each save, put-off, let-go, rewording and relation as a write, and the questions code asks (reading or practising, a skill as a goal, two items as one, still wanted). The reply's words are code's. */
export function planLearnLater(
  input: LearnPlanInput,
): LearnPlan & { offeredDocuments: string[] | null } {
  const plan = planLearnOps(input, input.commands);
  const alreadyOffered = new Set(input.offeredDocuments ?? []);
  const questionOffers = input.commands
    .flatMap((command) =>
      command.kind === 'offerQuestionTask' ? [command] : [],
    )
    .map((offer) => ({
      ...offer,
      whoIds: offer.who
        .flatMap((name) => {
          const known = (input.knownPeople ?? []).find((person) =>
            person.names.some(
              (called) => called.toLowerCase() === name.toLowerCase(),
            ),
          );
          return known ? [known.id] : [];
        })
        .filter((id, at, all) => all.indexOf(id) === at),
    }))
    .filter((offer, index, all) => {
      const isNew = !alreadyOffered.has(offer.documentKey);
      return (
        isNew &&
        all.findIndex((other) => other.documentKey === offer.documentKey) ===
          index
      );
    });
  const goalOffers = input.commands.flatMap((command) =>
    command.kind === 'offerLearnGoal' ? [command] : [],
  );
  const asked = [
    ...input.asks.map((ask) => buildKindQuestion(ask)),
    ...goalOffers.map((offer) => buildGoalQuestion(offer.name)),
  ].map((question) =>
    toPlannedQuestion(question, { id: input.newId(), now: input.now }),
  );
  const offered = questionOffers.map((offer) =>
    buildQuestionsTaskQuestion(offer, {
      id: input.newId(),
      now: input.now,
      timeZone: input.timeZone,
    }),
  );
  return {
    ...plan,
    questions: [...plan.questions, ...asked, ...offered],
    offeredDocuments:
      questionOffers.length === 0
        ? null
        : [
            ...(input.offeredDocuments ?? []),
            ...questionOffers.map((offer) => offer.documentKey),
          ].slice(-OFFERED_DOCUMENTS_MAX),
  };
}

export interface LearnResolveInput {
  captureId: string;
  executionId: string;
  seal: LearnPlanInput['seal'];
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  timeZone: string;
  items: LearnItem[];
  newId: () => string;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const toGoalName = (name: string) =>
  name.charAt(0).toUpperCase() + name.slice(1);

/** What an answer to a learn-later question asks for: the saved question's writes, a goal to make (its name), or nothing. */
export type LearnAnswer =
  | { kind: 'ops'; ops: LearnOp[] }
  | { kind: 'goal'; name: string; ops: LearnOp[] }
  | { kind: 'nothing' };

const readHeldAnswer = (
  held: Record<string, unknown>,
  optionId: string,
): LearnAnswer | null => {
  if (held.kind === 'learnKind') {
    const question = toText(held.question);
    const subject = toText(held.subject);
    if (!question || !subject) return null;
    if (optionId === 'read') {
      return {
        kind: 'ops',
        ops: [
          {
            kind: 'saveForLater',
            question,
            subject,
            contextLine: toText(held.contextLine),
            needsLiveFacts: held.needsLiveFacts === true,
            practise: 'read',
            quote: null,
          },
        ],
      };
    }
    return optionId === 'goal'
      ? {
          kind: 'goal',
          name: toGoalName(toText(held.goalName) ?? subject),
          ops: [],
        }
      : null;
  }
  if (held.kind === 'learnGoal') {
    const name = toText(held.name);
    if (!name) return null;
    return optionId === 'yes'
      ? { kind: 'goal', name: toGoalName(name), ops: [] }
      : optionId === 'no'
        ? { kind: 'nothing' }
        : null;
  }
  if (held.kind === 'learnStill') {
    const itemId = toText(held.researchId);
    if (!itemId) return null;
    return optionId === 'keep'
      ? { kind: 'ops', ops: [{ kind: 'keepStill', itemId }] }
      : optionId === 'remove'
        ? {
            kind: 'ops',
            ops: [
              {
                kind: 'declineLearn',
                itemId,
                reason: 'lostInterest',
                question: null,
                subject: null,
              },
            ],
          }
        : null;
  }
  if (held.kind === 'learnTogether') {
    const olderId = toText(held.olderId);
    const newerId = toText(held.newerId);
    const together = toText(held.together);
    if (!olderId || !newerId || !together) return null;
    return optionId === 'together'
      ? { kind: 'ops', ops: [{ kind: 'together', olderId, newerId, together }] }
      : optionId === 'apart'
        ? { kind: 'nothing' }
        : null;
  }
  return null;
};

export const LEARN_QUESTION_KINDS = [
  'learnKind',
  'learnGoal',
  'learnStill',
  'learnTogether',
] as const;

export type LearnResolveResult =
  | { refused: 'answered' | 'unknown' | 'gone' }
  | {
      refused: null;
      plan: LearnPlan;
      /** A goal the answer asks to make; the caller builds and writes it, and adds its line and effect. */
      goal: string | null;
      capture: Record<string, unknown>;
    };

/** Decides what answering a learn-later question writes, without touching a database. A kind of save, a skill as a goal, an item kept or let go and two items put together each close the question; the held words come from the stored question, never from the person's tap. */
export function planResolveLearn(input: LearnResolveInput): LearnResolveResult {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  if ((state.dismissedAt ?? null) !== null) return { refused: 'gone' };
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isRecord)
    : null;
  if (!held || !LEARN_QUESTION_KINDS.some((kind) => kind === held.kind)) {
    return { refused: 'unknown' };
  }
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord).map((option) => option.id)
    : [];
  if (!options.includes(optionId)) return { refused: 'unknown' };
  const answer = readHeldAnswer(held, optionId);
  if (!answer) return { refused: 'unknown' };
  const ids = [held.researchId, held.olderId, held.newerId].filter(
    (id): id is string => typeof id === 'string',
  );
  if (ids.some((id) => !input.items.some((item) => item.id === id))) {
    return { refused: 'gone' };
  }
  const plan = planLearnOps(
    {
      commands: [],
      asks: [],
      items: input.items,
      isSpoken: false,
      isMidTask: false,
      timeZone: input.timeZone,
      now,
      captureId: input.captureId,
      newId: input.newId,
      seal: input.seal,
      room: 20,
    },
    answer.kind === 'nothing' ? [] : answer.ops,
  );
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) =>
      entry.answeredAt === null && (entry.dismissedAt ?? null) === null,
  );
  return {
    refused: null,
    plan,
    goal: answer.kind === 'goal' ? answer.name : null,
    capture: {
      questionState,
      sealed: {
        ...input.opened,
        questions: {
          ...oldQuestions,
          [questionId]: {
            ...question,
            answer: {
              by: input.by,
              at: now,
              turnCaptureId: null,
              shape: question.shape === 'yesNo' ? 'yesNo' : 'pickOne',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
    },
  };
}

/** The execution an answer leaves, so Undo can take its writes back; null when the answer wrote nothing. */
export const buildLearnAnswerExecution = (
  plan: Pick<LearnPlan, 'effectRefs' | 'effects' | 'lines' | 'notKept'>,
  input: {
    captureId: string;
    questionId: string;
    now: number;
    seal: LearnPlanInput['seal'];
  },
) =>
  plan.effects.length === 0
    ? null
    : buildHabitAnswerExecution({ isPrivate: false, ...plan }, input);
