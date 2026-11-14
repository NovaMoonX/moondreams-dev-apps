import { buildNameHints, type NameHintCandidate } from '@/lib/speech/nameHints';
import { COMMON_WORDS, toComparable } from '@/utils/optionMatchUtils';
import { DEFAULT_ASSISTANT_NAME } from '@apps/helm/constants';
import type { HelmState } from '@apps/helm/store/helmSlice';
import type { ScreenContext } from '@apps/helm/types';
import { readAssistantName } from '@apps/helm/utils/assistantName';
import { DOSE_PATTERN, hasHealthWord } from '@apps/helm/utils/privacy';
import {
  buildParentIndex,
  readRecordPrivacy,
  type PrivacyRecord,
  type PrivateKind,
} from '@apps/helm/utils/privacyParents';

export type NameHintState = Pick<
  HelmState,
  | 'profile'
  | 'who'
  | 'places'
  | 'projects'
  | 'topics'
  | 'procedures'
  | 'openTasks'
  | 'projectTasks'
  | 'recentCaptures'
  | 'unseenCaptures'
  | 'waitingCaptures'
>;

const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_WORD_LETTERS = 3;
const ASSISTANT_WEIGHT = 1_000_000;
const FIRST_NAME_SHARE = 0.5;

interface Entry {
  kind: PrivateKind;
  record: PrivacyRecord;
  forms: string[];
  firstName: string | null;
  fallbackRank: number;
  soundsLike: readonly string[];
  lastMentionedAt: number | null;
  touchedAt: number;
}

const slicesOf = (state: NameHintState) => [
  state.profile,
  state.who,
  state.places,
  state.projects,
  state.topics,
  state.procedures,
  state.openTasks,
  state.projectTasks,
  state.recentCaptures,
  state.unseenCaptures,
  state.waitingCaptures,
];

const memo = {
  uid: null as string | null,
  slices: [] as unknown[],
  screen: null as ScreenContext | null,
  hour: -1,
  result: [] as string[],
};

const toEntries = (state: NameHintState): Entry[] => [
  ...state.who.items.flatMap((who) =>
    who.isUnreadable || who.name.trim() === ''
      ? []
      : [
          {
            kind: 'who' as const,
            record: who,
            forms: [who.name, ...who.aliases],
            firstName: who.name.trim().split(/\s+/)[0],
            fallbackRank: 3,
            soundsLike: who.soundsLike ?? [],
            lastMentionedAt: who.lastMentionedAt,
            touchedAt: who.lastMentionedAt ?? who.lastEditedAt ?? who.createdAt,
          },
        ],
  ),
  ...state.places.items.flatMap((place) =>
    place.isUnreadable || place.name.trim() === ''
      ? []
      : [
          {
            kind: 'place' as const,
            record: place,
            forms: [place.name, ...place.aliases],
            firstName: null,
            fallbackRank: 3,
            soundsLike: [],
            lastMentionedAt: null,
            touchedAt: place.lastEditedAt ?? place.createdAt,
          },
        ],
  ),
  ...state.projects.items.flatMap((project) =>
    project.isUnreadable || project.name.trim() === ''
      ? []
      : [
          {
            kind: 'project' as const,
            record: project,
            forms: [project.name],
            firstName: null,
            fallbackRank: project.status === 'active' ? 2 : 3,
            soundsLike: [],
            lastMentionedAt: null,
            touchedAt: project.lastEditedAt ?? project.createdAt,
          },
        ],
  ),
  ...state.topics.items.flatMap((topic) =>
    topic.isUnreadable || topic.name.trim() === ''
      ? []
      : [
          {
            kind: 'topic' as const,
            record: topic,
            forms: [topic.name],
            firstName: null,
            fallbackRank: 3,
            soundsLike: [],
            lastMentionedAt: null,
            touchedAt: topic.lastEditedAt ?? topic.createdAt,
          },
        ],
  ),
  ...state.procedures.items.flatMap((procedure) =>
    procedure.title.trim() === ''
      ? []
      : [
          {
            kind: 'procedure' as const,
            record: procedure,
            forms: [procedure.title],
            firstName: null,
            fallbackRank: 3,
            soundsLike: [],
            lastMentionedAt: null,
            touchedAt: procedure.lastEditedAt ?? procedure.createdAt,
          },
        ],
  ),
];

const countMentions = (state: NameHintState, since: number) =>
  [state.recentCaptures, state.unseenCaptures, state.waitingCaptures]
    .flatMap((set) => set.captures)
    .reduce((counts, capture) => {
      const wasRecent = capture.createdAt >= since ? 1 : 0;
      return [...capture.whoIds, ...capture.placeIds].reduce((next, id) => {
        const current = next.get(id) ?? { all: 0, recent: 0 };
        return next.set(id, {
          all: current.all + 1,
          recent: current.recent + wasRecent,
        });
      }, counts);
    }, new Map<string, { all: number; recent: number }>());

const readPageIds = (state: NameHintState, screen: ScreenContext | null) => {
  const taskIds = new Set(
    [screen?.focus, ...(screen?.visible ?? [])].flatMap((ref) =>
      ref ? [ref.id] : [],
    ),
  );
  const tasks = [...state.openTasks.items, ...state.projectTasks.items].filter(
    (task) => taskIds.has(task.id),
  );
  const topic = state.topics.items.find(
    (entry) => entry.id === screen?.topicId,
  );

  return new Set([
    ...(screen?.topicId ? [screen.topicId] : []),
    ...(screen?.procedureId ? [screen.procedureId] : []),
    ...(topic?.projectIds ?? []),
    ...tasks.flatMap((task) => [
      ...task.whoIds,
      ...task.placeIds,
      ...(task.projectId ? [task.projectId] : []),
    ]),
  ]);
};

const toWords = (text: string) => toComparable(text).split(' ').filter(Boolean);

/** Everything the list must never carry, read from the whole store: the forms of every record private in effect (own, inherited or care) and each of their uncommon words, so a non-private record carrying one of those words is refused too, and anything with a health word or a dose. */
const toExclude = (privateEntries: Entry[]) => {
  const forms = privateEntries.flatMap((entry) => entry.forms);
  const whole = new Set(forms.map((form) => toComparable(form)));
  const words = new Set(
    forms
      .flatMap(toWords)
      .filter((word) => word.length >= MIN_WORD_LETTERS)
      .filter((word) => !COMMON_WORDS.has(word)),
  );

  return (text: string) =>
    hasHealthWord(text) ||
    DOSE_PATTERN.test(text) ||
    whole.has(toComparable(text)) ||
    toWords(text).some((word) => words.has(word));
};

/** The names a listen is told to expect, built from the store at the start of each listen: the person's own who, places, projects, topics and procedures by name, and the assistant's, ranked by the page in view, the last 2 weeks and how often each is named, and cut to the recognizers' budget. Nothing private, no care item and no health word or dose is ever in it, and a record that was misheard before ranks up a step. The list is kept per `uid`, so a sign-in on the same page never reads the last person's. */
export function readHelmNameHints(
  state: NameHintState,
  screen: ScreenContext | null,
  uid: string | null,
  now: number = Date.now(),
): string[] {
  const slices = slicesOf(state);
  const hour = Math.floor(now / HOUR_MS);
  if (
    memo.uid === uid &&
    memo.screen === screen &&
    memo.hour === hour &&
    memo.slices.length === slices.length &&
    slices.every((slice, at) => slice === memo.slices[at])
  ) {
    return memo.result;
  }
  const entries = toEntries(state);
  const index = buildParentIndex(
    state.projects.items,
    state.who.items,
    state.places.items,
  );
  const isPrivate = (entry: Entry) =>
    readRecordPrivacy(entry.kind, entry.record, index) === 'private';
  const mentions = countMentions(state, now - RECENT_MS);
  const pageIds = readPageIds(state, screen);
  const toCandidates = (entry: Entry): NameHintCandidate[] => {
    const seen = mentions.get(entry.record.id);
    const isRecent =
      (seen?.recent ?? 0) > 0 ||
      (entry.lastMentionedAt !== null &&
        entry.lastMentionedAt >= now - RECENT_MS);
    const base = pageIds.has(entry.record.id)
      ? 0
      : isRecent
        ? 1
        : (seen?.all ?? 0) > 0
          ? 2
          : entry.fallbackRank;
    const rank = entry.soundsLike.length > 0 ? Math.max(0, base - 1) : base;
    const weight = (seen?.all ?? 0) + entry.touchedAt / Math.max(now, 1);
    return [
      ...entry.forms.map((text) => ({ text, rank, weight })),
      ...(entry.firstName !== null && entry.firstName !== entry.forms[0]
        ? [{ text: entry.firstName, rank, weight: weight * FIRST_NAME_SHARE }]
        : []),
    ];
  };
  const assistant = readAssistantName(state.profile?.assistantName);
  const result = buildNameHints(
    [
      ...entries.filter((entry) => !isPrivate(entry)).flatMap(toCandidates),
      {
        text: assistant ?? DEFAULT_ASSISTANT_NAME,
        rank: 0,
        weight: ASSISTANT_WEIGHT,
      },
    ],
    { exclude: toExclude(entries.filter(isPrivate)) },
  );
  Object.assign(memo, { uid, slices, screen, hour, result });

  return result;
}
