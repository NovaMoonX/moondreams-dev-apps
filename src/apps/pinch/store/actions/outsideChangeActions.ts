import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

const undoAppChangeCallable = httpsCallable<
  { connectorId: 'app:pinch'; changeId: string; from: 'pinch' },
  { ok: true } | { ok: false; message: string }
>(functions, 'undoAppChange');

/** Takes back an outside change; null once it is undone, else the sentence saying why it can't be. */
export const undoOutsideChange = async (
  changeId: string,
): Promise<string | null> => {
  const { data } = await undoAppChangeCallable({
    connectorId: 'app:pinch',
    changeId,
    from: 'pinch',
  });
  return data.ok ? null : data.message;
};
