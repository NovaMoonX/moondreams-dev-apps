// Temporary stub: replaced by the data layer on merge.
/* eslint-disable @typescript-eslint/no-unused-vars */
export const createGoal = (
  _uid: string,
  _input: { name: string; emoji: string | null; whyText: string | null },
): Promise<string> => Promise.resolve('');

export const editGoalWhy = (
  _uid: string,
  _projectId: string,
  _whyText: string | null,
): Promise<void> => Promise.resolve();

export const setWhyChoice = (
  _uid: string,
  _projectId: string,
  _choice: 'accepted' | 'declined',
): Promise<void> => Promise.resolve();

export const setGoalAside = (_uid: string, _projectId: string): Promise<void> =>
  Promise.resolve();

export const pickGoalBackUp = (
  _uid: string,
  _projectId: string,
): Promise<void> => Promise.resolve();

export const turnIntoProject = (
  _uid: string,
  _projectId: string,
  _habits: 'keep' | 'delete',
): Promise<void> => Promise.resolve();

export const deleteGoal = (
  _uid: string,
  _projectId: string,
  _habits: 'keep' | 'delete',
): Promise<void> => Promise.resolve();
