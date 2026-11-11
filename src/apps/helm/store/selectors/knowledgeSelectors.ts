import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenNote, OpenTopic } from '@apps/helm/types';
import { buildTopicTree } from '@apps/helm/utils/topicTree';

const selectNotes = (state: RootState) => state.helm.notes.items;
const selectTopics = (state: RootState) => state.helm.topics.items;

const lastTouched = (note: OpenNote) => note.lastEditedAt ?? note.createdAt;

/** Every note, the most recently touched first. */
export const selectAllNotes = createSelector([selectNotes], (notes) =>
  [...notes].sort((left, right) => lastTouched(right) - lastTouched(left)),
);

export const selectNoteById = createSelector(
  [selectNotes],
  (notes): Map<string, OpenNote> =>
    new Map(notes.map((note) => [note.id, note])),
);

/** Notes in no topic, the most recently touched first. */
export const selectLooseNotes = createSelector([selectAllNotes], (notes) =>
  notes.filter((note) => note.topicIds.length === 0),
);

/** Each topic's own notes, the most recently touched first. */
export const selectNotesByTopic = createSelector(
  [selectAllNotes],
  (notes): Map<string, OpenNote[]> =>
    notes.reduce((byTopic, note) => {
      note.topicIds.forEach((topicId) =>
        byTopic.set(topicId, [...(byTopic.get(topicId) ?? []), note]),
      );
      return byTopic;
    }, new Map<string, OpenNote[]>()),
);

export const selectAllTopics = selectTopics;

export const selectTopicById = createSelector(
  [selectTopics],
  (topics): Map<string, OpenTopic> =>
    new Map(topics.map((topic) => [topic.id, topic])),
);

/** The topics as a tree, each level A to Z. */
export const selectTopicTree = createSelector([selectTopics], (topics) =>
  buildTopicTree(topics),
);

/** How many topics sit directly under each one. */
export const selectSubtopicsByParent = createSelector(
  [selectTopics],
  (topics): Map<string, OpenTopic[]> =>
    topics.reduce((byParent, topic) => {
      if (topic.parentId !== null) {
        byParent.set(topic.parentId, [
          ...(byParent.get(topic.parentId) ?? []),
          topic,
        ]);
      }
      return byParent;
    }, new Map<string, OpenTopic[]>()),
);
