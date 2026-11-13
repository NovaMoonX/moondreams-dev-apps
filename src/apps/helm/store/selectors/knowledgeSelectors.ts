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

export const selectAllTopics = selectTopics;

export const selectTopicById = createSelector(
  [selectTopics],
  (topics): Map<string, OpenTopic> =>
    new Map(topics.map((topic) => [topic.id, topic])),
);

/** Notes in no topic that is loaded, the most recently touched first. */
export const selectLooseNotes = createSelector(
  [selectAllNotes, selectTopicById],
  (notes, topicById) =>
    notes.filter((note) => !note.topicIds.some((id) => topicById.has(id))),
);

/** Each loaded topic's own notes, the most recently touched first. */
export const selectNotesByTopic = createSelector(
  [selectAllNotes, selectTopicById],
  (notes, topicById): Map<string, OpenNote[]> =>
    notes.reduce((byTopic, note) => {
      note.topicIds
        .filter((id) => topicById.has(id))
        .forEach((topicId) => {
          const list = byTopic.get(topicId);
          if (list) list.push(note);
          else byTopic.set(topicId, [note]);
        });
      return byTopic;
    }, new Map<string, OpenNote[]>()),
);
/** The topics as a tree, each level A to Z. */
export const selectTopicTree = createSelector([selectTopics], (topics) =>
  buildTopicTree(topics),
);

/** The topics sitting directly under each one. */
export const selectSubtopicsByParent = createSelector(
  [selectTopics],
  (topics): Map<string, OpenTopic[]> =>
    topics.reduce((byParent, topic) => {
      if (topic.parentId !== null) {
        const list = byParent.get(topic.parentId);
        if (list) list.push(topic);
        else byParent.set(topic.parentId, [topic]);
      }
      return byParent;
    }, new Map<string, OpenTopic[]>()),
);
