import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { getErrorMessage } from '@/utils/errorUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import { reconnectLink } from '@apps/runway/store/actions/linkActions';

/** Signs in again at a bank that stopped syncing and says how it went; one at a time. */
export function useReconnectLink() {
  const { addToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const reconnect = async (linkId: string, bank: string) => {
    if (busyId !== null) return;
    setBusyId(linkId);
    try {
      const result = await reconnectLink(linkId);
      if (result === null) return;
      addToast({
        title:
          result.state !== 'ok'
            ? LINK_WORDS.reconnectStillStuck(bank)
            : result.newAccounts > 0
              ? LINK_WORDS.reconnectNewAccounts(bank, result.newAccounts)
              : LINK_WORDS.reconnectDone(bank),
        type: result.state === 'ok' ? 'success' : 'info',
      });
    } catch (error) {
      addToast({
        title: getErrorMessage(error, LINK_WORDS.reconnectFailed(bank)),
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  return { reconnect, busyId };
}
