import type { OpenNote, OpenTopic } from '@apps/helm/types';
import { toComparable } from '@/utils/optionMatchUtils';

const MAX_HINTS = 8;
const MAX_TOPIC_CHOICES = 5;
const FIT_MIN_SCORE = 0.8;
const FIT_MARGIN = 1.5;
const TITLE_WEIGHT = 2;
const TOPIC_WEIGHT = 1.5;
const SATURATION = 1.2;
const DAMPING = 0.75;

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can do does for from had has have how i if in into is it its just me my of on or ' +
    'our so that the their them then there these they this to up us was we were what when where which who why will ' +
    'with you your remember note please'
  ).split(' '),
);

const toWords = (text: string) =>
  toComparable(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

const BODY_WORDS_MAX = 2000;

const toCounts = (words: string[]) =>
  words.reduce(
    (counts, word) => counts.set(word, (counts.get(word) ?? 0) + 1),
    new Map<string, number>(),
  );

type Rankable = Pick<OpenNote, 'id' | 'title' | 'body' | 'topicIds'>;

/** A note's words counted once per version of it, so ranking again after a keystroke or a send only re-reads notes that changed. */
const COUNTED = new WeakMap<
  object,
  {
    title: Map<string, number>;
    bodyLength: number;
    body: Map<string, number>;
  }
>();

const toCounted = (note: Rankable) => {
  const known = COUNTED.get(note);
  if (known) return known;
  const body = toWords(note.body).slice(0, BODY_WORDS_MAX);
  const counted = {
    title: toCounts(toWords(note.title)),
    bodyLength: body.length,
    body: toCounts(body),
  };
  COUNTED.set(note, counted);
  return counted;
};

const scoreNotes = (
  text: string,
  notes: Rankable[],
  topics: Pick<OpenTopic, 'id' | 'name'>[],
): { id: string; score: number }[] => {
  const wanted = [...new Set(toWords(text))];
  if (wanted.length === 0 || notes.length === 0) return [];
  const names = new Map(topics.map((topic) => [topic.id, toWords(topic.name)]));
  const entries = notes.map((note) => ({
    id: note.id,
    ...toCounted(note),
    topic: toCounts(note.topicIds.flatMap((id) => names.get(id) ?? [])),
  }));
  const average = Math.max(
    1,
    entries.reduce((sum, entry) => sum + entry.bodyLength, 0) / entries.length,
  );
  return entries
    .map((entry) => {
      const damping = 1 - DAMPING + (DAMPING * entry.bodyLength) / average;
      const score = wanted.reduce((sum, word) => {
        const weighted =
          (entry.title.get(word) ?? 0) * TITLE_WEIGHT +
          (entry.body.get(word) ?? 0) +
          (entry.topic.get(word) ?? 0) * TOPIC_WEIGHT;
        return (
          sum +
          (weighted === 0 ? 0 : weighted / (weighted + SATURATION * damping))
        );
      }, 0);
      return { id: entry.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
};

/** The ids of the notes that best match the typed words (at most 8, each scoring above zero), by word overlap with the title (counts double), the body and the names of the topics it is filed in. Lexical only. */
export const rankNotes = (
  text: string,
  notes: Rankable[],
  topics: Pick<OpenTopic, 'id' | 'name'>[],
): string[] =>
  scoreNotes(text, notes, topics)
    .slice(0, MAX_HINTS)
    .map((entry) => entry.id);

/** The one topic a new note belongs in because the stored note it most resembles is clearly ahead (it scores at least 0.8 and 1.5 times the next one) and sits in exactly one topic; null when no note stands out. */
export function pickFittingTopic(
  text: string,
  notes: Rankable[],
  topics: Pick<OpenTopic, 'id' | 'name'>[],
): string | null {
  const [top, next] = scoreNotes(text, notes, topics);
  if (!top || top.score < FIT_MIN_SCORE) return null;
  if (next && top.score < next.score * FIT_MARGIN) return null;
  const own = (notes.find((note) => note.id === top.id)?.topicIds ?? []).filter(
    (id) => topics.some((topic) => topic.id === id),
  );
  return own.length === 1 ? own[0] : null;
}

/** Up to five topics for the words, the ones whose name or outline shares the most with them first and the rest as they come. */
export function rankTopicChoices<
  T extends Pick<OpenTopic, 'id' | 'name' | 'overview' | 'sections'>,
>(text: string, topics: T[]): T[] {
  const ranked = rankNotes(
    text,
    topics.map((topic) => ({
      id: topic.id,
      title: topic.name,
      body: [
        topic.overview ?? '',
        ...topic.sections.flatMap((section) => [
          section.heading ?? '',
          section.markdown,
        ]),
      ].join(' '),
      topicIds: [],
    })),
    [],
  ).flatMap((id) => topics.filter((topic) => topic.id === id));
  return [
    ...ranked,
    ...topics.filter((topic) => !ranked.includes(topic)),
  ].slice(0, MAX_TOPIC_CHOICES);
}
