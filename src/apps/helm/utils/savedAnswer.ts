import { toComparable } from '@/utils/optionMatchUtils';
import { NOTE_TITLE_MAX } from '@apps/helm/constants';
import type { CaptureAnswer, OpenNote, OpenTopic } from '@apps/helm/types';
import { pickFittingTopic } from '@apps/helm/utils/noteSearch';

const cutAtWord = (text: string, max: number) =>
  text.length <= max
    ? text
    : text.slice(0, max).replace(/\s+\S*$/, '') || text.slice(0, max);

/** The question as a note title: one line, no closing question mark or full stop, first letter capitalised, at most 80 characters. */
export function toSavedNoteTitle(question: string): string {
  const cleaned = question
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s?!.]+$/, '');
  const capitalised = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cutAtWord(capitalised, NOTE_TITLE_MAX);
}

export type SavedAnswerPlan =
  | { kind: 'kept'; note: OpenNote }
  | { kind: 'new'; title: string; body: string; topic: OpenTopic | null };

/** What saving a general answer does: nothing when a note already holds its words, otherwise a new note filed under the topic the model suggested if the person has it, else the one topic a clearly similar stored note sits in, else loose. */
export function planSavedAnswer(
  answer: Pick<CaptureAnswer, 'question' | 'general' | 'suggestedTopicId'>,
  notes: OpenNote[],
  topics: OpenTopic[],
): SavedAnswerPlan {
  const body = (answer.general ?? '').trim();
  const kept = notes.find(
    (note) =>
      !note.isUnreadable && toComparable(note.body) === toComparable(body),
  );
  if (kept) return { kind: 'kept', note: kept };
  const title = toSavedNoteTitle(answer.question);
  const readable = topics.filter((topic) => !topic.isUnreadable);
  const topicId =
    readable.find((topic) => topic.id === answer.suggestedTopicId)?.id ??
    pickFittingTopic(
      `${title} ${body}`,
      notes.filter((note) => !note.isUnreadable),
      readable,
    );
  return {
    kind: 'new',
    title,
    body,
    topic: readable.find((topic) => topic.id === topicId) ?? null,
  };
}
