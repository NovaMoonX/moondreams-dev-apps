import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

export type MailStyleResult =
  | { status: 'learned'; groups: number }
  | { status: 'notEnough'; groups: number }
  | { status: 'busy'; groups: number };

const learnHelmMailStyleCallable = httpsCallable<
  Record<string, never>,
  MailStyleResult
>(functions, 'learnHelmMailStyle');

/** Reads the person's sent mail once on the server and writes short notes per occasion and person. */
export const learnMailStyle = async () =>
  (await learnHelmMailStyleCallable({})).data;
