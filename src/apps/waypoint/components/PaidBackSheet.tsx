import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Check, Circle } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { formatDateTime } from '@/utils/formatUtils';
import { LIST_SEARCH_THRESHOLD } from '@apps/waypoint/constants';
import type { TripExpense } from '@apps/waypoint/types';
import { getRepaidHistory } from '@apps/waypoint/utils/repaidStatus';

const HISTORY_PAGE = 6;

interface PaidBackShare {
  uid: string;
  amountLabel: string;
  isPaid: boolean;
  markedByUid: string | null;
}

interface PaidBackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  expense: TripExpense | undefined;
  shares: PaidBackShare[];
  currentUserId: string;
  memberLabel: (uid: string) => string;
  onToggle: (uid: string) => void;
}

function PaidBackSheet({ isOpen, onClose, expense, shares, currentUserId, memberLabel, onToggle }: PaidBackSheetProps) {
  const [query, setQuery] = useState('');
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE);
  const needle = query.trim().toLowerCase();
  const visibleShares = shares.filter((share) => memberLabel(share.uid).toLowerCase().includes(needle));
  const history = expense ? getRepaidHistory(expense) : [];
  const actorName = (uid: string) => (uid === currentUserId ? 'You' : memberLabel(uid));

  const getHistoryLine = ({ debtorUid, entry, previous }: (typeof history)[number]) => {
    const getSubject = () => {
      if (debtorUid !== entry.byUid) {
        return `${memberLabel(debtorUid)}'s share`;
      }
      return entry.byUid === currentUserId ? 'your own share' : 'their own share';
    };
    const getPreviousActor = (uid: string) => {
      if (uid === currentUserId) {
        return 'you';
      }
      return uid === debtorUid ? 'they' : memberLabel(uid);
    };
    const was = !entry.isPaid && previous?.isPaid ? `, after ${getPreviousActor(previous.byUid)} marked it paid back` : '';
    return `${actorName(entry.byUid)} marked ${getSubject()} ${entry.isPaid ? 'paid back' : 'not paid back'}${was}`;
  };

  return (
    <DetailSheet isOpen={isOpen} onClose={onClose} title="Who's paid you back">
      {expense && (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            {expense.title} · {shares.filter((share) => share.isPaid).length} of {shares.length} paid back. Tap a name
            once you&apos;ve received their share.
          </p>
          {shares.length >= LIST_SEARCH_THRESHOLD && (
            <SearchInput value={query} onChange={setQuery} placeholder='Search people' />
          )}
          {visibleShares.length === 0 ? (
            <p className='text-muted-foreground text-sm'>Nobody matches that.</p>
          ) : (
            <ul className='divide-border divide-y'>
              {visibleShares.map((share) => (
                <li key={share.uid}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`${share.isPaid ? 'Mark not received' : 'Mark received'}: ${memberLabel(share.uid)}`}
                    onClick={() => onToggle(share.uid)}
                    className='h-auto w-full justify-start gap-3 rounded-none px-0! py-2.5 text-left font-normal'
                  >
                    {share.isPaid ? (
                      <Check className='h-4 w-4 shrink-0 text-emerald-600' aria-hidden='true' />
                    ) : (
                      <Circle className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
                    )}
                    <span className='min-w-0 flex-1'>
                      <span className={share.isPaid ? 'text-muted-foreground block truncate text-sm' : 'block truncate text-sm'}>
                        {memberLabel(share.uid)}
                      </span>
                      {share.isPaid && share.markedByUid !== null && (
                        <span className='text-muted-foreground block truncate text-xs'>
                          Marked by {share.markedByUid === currentUserId ? 'you' : memberLabel(share.markedByUid)}
                        </span>
                      )}
                    </span>
                    <span className='shrink-0 text-sm tabular-nums'>{share.amountLabel}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {history.length > 0 && (
            <div className='space-y-2'>
              <SectionDivider label='History' />
              <ul className='space-y-2'>
                {history.slice(0, historyCount).map((item) => (
                  <li key={`${item.debtorUid}-${item.entry.at}-${item.entry.isPaid}`} className='text-sm'>
                    {getHistoryLine(item)}
                    <span className='text-muted-foreground block text-xs'>{formatDateTime(item.entry.at)}</span>
                  </li>
                ))}
              </ul>
              {history.length > historyCount && (
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='h-10 px-0!'
                  onClick={() => setHistoryCount((count) => count + HISTORY_PAGE)}
                >
                  Show {Math.min(HISTORY_PAGE, history.length - historyCount)} more
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default PaidBackSheet;
