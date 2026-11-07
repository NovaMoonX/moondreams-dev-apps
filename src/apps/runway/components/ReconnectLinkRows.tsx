import { useState } from 'react';
import { ChevronRight, Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import { reconnectLink } from '@apps/runway/store/actions/linkActions';

/** One row per bank that stopped syncing and is waiting on the person: a tap signs in again at the bank and syncs it. */
function ReconnectLinkRows() {
  const { addToast } = useToast();
  const waiting = useAppSelector((state) =>
    state.runway.links.filter((link) => link.status === 'needsAttention'),
  );
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

  if (waiting.length === 0) return null;
  return (
    <ul className='space-y-2'>
      {waiting.map((link) => {
        const bank = link.institutionName || LINK_WORDS.yourBank;
        return (
          <li key={link.id}>
            <Button
              type='button'
              variant='tertiary'
              className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal'
              onClick={() => void reconnect(link.id, bank)}
            >
              <span
                className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
                aria-hidden='true'
              >
                <Landmark className='h-4 w-4' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>
                  {LINK_WORDS.reconnectTitle(bank)}
                </span>
                <span className='text-muted-foreground block text-[13px]'>
                  {LINK_WORDS.reconnectNote}
                </span>
              </span>
              <ChevronRight
                className='text-muted-foreground h-4 w-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default ReconnectLinkRows;
