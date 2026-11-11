import type { OpenTopic, TopicSource } from '@apps/helm/types';

/** The note a source was made from; null for words that came from no note. */
export const sourceNoteId = (source: TopicSource): string | null =>
  source.kind === 'person' ? null : source.noteId;

/** The topics whose document cites a note, by id. */
export const topicsCitingNote = (
  topics: readonly OpenTopic[],
  noteId: string,
): string[] =>
  topics
    .filter((topic) =>
      topic.sections.some((section) =>
        section.sources.some((source) => sourceNoteId(source) === noteId),
      ),
    )
    .map((topic) => topic.id);
