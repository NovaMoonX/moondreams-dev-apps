import type { OpenNote, OpenTopic } from '@apps/helm/types';
import { toComparable } from '@/utils/optionMatchUtils';

const MAX_HINTS = 8;
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

const countOf = (words: string[], word: string) =>
  words.filter((entry) => entry === word).length;

/** The ids of the notes that best match the typed words (at most 8, each scoring above zero), by word overlap with the title (counts double), the body and the names of the topics it is filed in. Lexical only. */
export function rankNotes(
  text: string,
  notes: Pick<OpenNote, 'id' | 'title' | 'body' | 'topicIds'>[],
  topics: Pick<OpenTopic, 'id' | 'name'>[],
): string[] {
  const wanted = [...new Set(toWords(text))];
  if (wanted.length === 0 || notes.length === 0) return [];
  const names = new Map(topics.map((topic) => [topic.id, topic.name]));
  const entries = notes.map((note) => ({
    id: note.id,
    title: toWords(note.title),
    body: toWords(note.body),
    topic: toWords(note.topicIds.map((id) => names.get(id) ?? '').join(' ')),
  }));
  const average = Math.max(
    1,
    entries.reduce((sum, entry) => sum + entry.body.length, 0) / entries.length,
  );
  return entries
    .map((entry) => {
      const damping = 1 - DAMPING + (DAMPING * entry.body.length) / average;
      const score = wanted.reduce((sum, word) => {
        const weighted =
          countOf(entry.title, word) * TITLE_WEIGHT +
          countOf(entry.body, word) +
          countOf(entry.topic, word) * TOPIC_WEIGHT;
        return (
          sum +
          (weighted === 0 ? 0 : weighted / (weighted + SATURATION * damping))
        );
      }, 0);
      return { id: entry.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HINTS)
    .map((entry) => entry.id);
}
