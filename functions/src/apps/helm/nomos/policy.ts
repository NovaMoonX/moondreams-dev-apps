import type { NomosCommand } from './commands.js';

/** Acts inside Helm and can be undone. */
export const AUTOMATIC_LEVEL = 2;

export type Decision = 'automatic';

/** Creating, changing and finishing a task all land inside Helm and are undoable, so each runs without asking. */
export const decide = (command: NomosCommand): Decision => {
  switch (command.kind) {
    case 'createTask':
    case 'updateTask':
    case 'completeTask':
      return 'automatic';
    default:
      return 'automatic';
  }
};
