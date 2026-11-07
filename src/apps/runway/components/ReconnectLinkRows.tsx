import { useState } from 'react';
import { Check, ChevronRight, Landmark, LoaderCircle } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';
import { LINK_WORDS } from '@apps/runway/constants';
import { useReconnectLink } from '@apps/runway/hooks/useReconnectLink';

const DONE_SHOWN_MS = 1800;
const LEAVE_MS = 300;

interface Reconnected {
  bank: string;
  isLeaving: boolean;
}

/** One row per bank that stopped syncing and is waiting on the person: a tap signs in again at the bank and syncs it, and a bank that comes back says so before its row folds away. */
function ReconnectLinkRows() {
  const links = useAppSelector((state) => state.runway.links);
  const { reconnect, busyId } = useReconnectLink();
  const [reconnected, setReconnected] = useState<
    Readonly<Record<string, Reconnected>>
  >({});

  const start = async (linkId: string, bank: string) => {
    const isBack = await reconnect(linkId, bank);
    if (!isBack) return;
    setReconnected((current) => ({
      ...current,
      [linkId]: { bank, isLeaving: false },
    }));
    window.setTimeout(() => {
      setReconnected((current) =>
        current[linkId]
          ? { ...current, [linkId]: { ...current[linkId], isLeaving: true } }
          : current,
      );
    }, DONE_SHOWN_MS);
    window.setTimeout(() => {
      setReconnected((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== linkId),
        ),
      );
    }, DONE_SHOWN_MS + LEAVE_MS);
  };

  const waiting = links
    .filter(
      (link) =>
        link.status === 'needsAttention' && reconnected[link.id] === undefined,
    )
    .map((link) => ({
      id: link.id,
      bank: link.institutionName || LINK_WORDS.yourBank,
    }));
  const done = Object.entries(reconnected).map(([id, entry]) => ({
    id,
    ...entry,
  }));

  if (waiting.length === 0 && done.length === 0) return null;
  return (
    <ul className='space-y-2'>
      {done.map((entry) => (
        <li
          key={entry.id}
          className={join(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
            entry.isLeaving
              ? 'grid-rows-[0fr] opacity-0'
              : 'grid-rows-[1fr] opacity-100',
          )}
        >
          <div className='min-h-0 overflow-hidden'>
            <div
              role='status'
              className='border-success/40 bg-success/10 flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-1.5'
            >
              <span
                className='bg-success/20 text-success runway-pop grid size-8 shrink-0 place-items-center rounded-full'
                aria-hidden='true'
              >
                <Check className='h-4 w-4' strokeWidth={3} />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>
                  {LINK_WORDS.reconnectedTitle(entry.bank)}
                </span>
                <span className='text-muted-foreground block text-[13px]'>
                  {LINK_WORDS.reconnectedNote}
                </span>
              </span>
            </div>
          </div>
        </li>
      ))}
      {waiting.map((link) => {
        const isBusy = busyId === link.id;
        return (
          <li key={link.id}>
            <Button
              type='button'
              variant='tertiary'
              aria-busy={isBusy}
              className={join(
                'text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal',
                isBusy && 'runway-busy-edge',
              )}
              onClick={() => void start(link.id, link.bank)}
            >
              <span
                className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
                aria-hidden='true'
              >
                {isBusy ? (
                  <LoaderCircle className='h-4 w-4 animate-spin' />
                ) : (
                  <Landmark className='h-4 w-4' />
                )}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>
                  {isBusy
                    ? LINK_WORDS.reconnectingTitle(link.bank)
                    : LINK_WORDS.reconnectTitle(link.bank)}
                </span>
                <span className='text-muted-foreground block text-[13px]'>
                  {isBusy
                    ? LINK_WORDS.reconnectingNote
                    : LINK_WORDS.reconnectNote}
                </span>
              </span>
              {!isBusy && (
                <ChevronRight
                  className='text-muted-foreground h-4 w-4 shrink-0'
                  aria-hidden='true'
                />
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default ReconnectLinkRows;
