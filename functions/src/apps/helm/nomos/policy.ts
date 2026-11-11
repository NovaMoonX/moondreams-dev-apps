import type { NomosCommand, TopicCommand } from './commands.js';

/** Acts only on the person's own records and can be undone. */
export const AUTOMATIC_LEVEL = 2;

export type Decision = 'automatic';

/** Creating, changing and finishing a task each land on the person's own records and are undoable, so each runs without asking. */
export const decide = (command: NomosCommand): Decision => {
  switch (command.kind) {
    case 'createTask':
    case 'updateTask':
    case 'completeTask':
      return 'automatic';
  }
};

export type TopicDecision = 'automatic' | 'propose';

/** Adding a note's words to a topic, changing a topic's document on request and moving a topic are undoable, so they run; a new parent topic runs only when the words asked for it, and is otherwise proposed. */
export const decideTopic = (command: TopicCommand): TopicDecision =>
  command.kind === 'createParentTopic' && !command.isAsked
    ? 'propose'
    : 'automatic';

/** An assistant-made procedure is a draft the person can undo, so it runs without asking. */
export const decideProcedure = (): TopicDecision => 'automatic';
