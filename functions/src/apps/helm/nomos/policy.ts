import type { NomosCommand } from './commands.js';

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
