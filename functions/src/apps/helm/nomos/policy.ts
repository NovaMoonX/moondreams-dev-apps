import type {
  HabitCommand,
  NomosCommand,
  SetQuietCommand,
  TopicCommand,
} from './commands.js';

/** Acts only on the person's own records and can be undone. */
export const AUTOMATIC_LEVEL = 2;

export type Decision = 'automatic';

/** Creating, changing, finishing and marking a task private or quiet each land on the person's own records and are undoable, so each runs without asking. */
export const decide = (command: NomosCommand | SetQuietCommand): Decision => {
  switch (command.kind) {
    case 'createTask':
    case 'updateTask':
    case 'completeTask':
    case 'setPrivate':
    case 'setQuiet':
      return 'automatic';
  }
};

export type TopicDecision = 'automatic' | 'propose';

/** Adding a note's words to a topic, changing a topic's document on request and moving a topic are undoable, so they run; a new parent topic runs only when the words asked for it, and is otherwise proposed. */
export const decideTopic = (command: TopicCommand): TopicDecision =>
  command.kind === 'createParentTopic' && !command.isAsked
    ? 'propose'
    : 'automatic';

/** A habit made, changed, ticked or marked as care lands on the person's own records and can be undone, so each runs without asking; what a habit's state forbids (retiring a care habit, a tick on a paused one) is settled in the plan. */
export const decideHabit = (command: HabitCommand): Decision => {
  switch (command.kind) {
    case 'createHabit':
    case 'updateHabit':
    case 'checkIn':
    case 'setCare':
      return 'automatic';
  }
};
