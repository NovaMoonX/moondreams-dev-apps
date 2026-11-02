import { useState } from 'react';

import { Check, Circle } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import { formatDateTime } from '@/utils/formatUtils';
import { LIST_SEARCH_THRESHOLD } from '@apps/waypoint/constants';
import type { TripExpense } from '@apps/waypoint/types';
import { getRepaidHistory, type RepaidHistoryItem } from '@apps/waypoint/utils/repaidStatus';

const HISTORY_PAGE = 8;

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
  /** Resolves when the write has settled, so a row can answer at once and ignore a second tap meanwhile. */
  onToggle: (uid: string) => Promise<unknown>;
}

function PaidBackSheet({ isOpen, onClose, expense, shares, currentUserId, memberLabel, onToggle }: PaidBackSheetProps) {
  const [view, setView] = useState<'owed' | 'paid' | 'history' | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE);
  const needle = query.trim().toLowerCase();
  const matches = (uid: string) => memberLabel(uid).toLowerCase().includes(needle);
  const shownShares = shares.map((share) => ({ ...share, isPaid: pending[share.uid] ?? share.isPaid }));
  const owedCount = shownShares.filter((share) => !share.isPaid).length;
  const paidCount = shownShares.length - owedCount;
  const history = expense ? getRepaidHistory(expense) : [];
  const visibleHistory = history.filter((item) =>
    item.kind === 'reset' ? needle === '' || matches(item.byUid) : matches(item.debtorUid) || matches(item.entry.byUid),
  );
  const shownView = view ?? (owedCount > 0 ? 'owed' : 'paid');
  const visibleShares = shownShares.filter((share) => matches(share.uid) && share.isPaid === (shownView === 'paid'));

  const toggle = (share: PaidBackShare) => {
    if (share.uid in pending) {
      return;
    }
    setPending((current) => ({ ...current, [share.uid]: !share.isPaid }));
    void onToggle(share.uid).finally(() =>
      setPending((current) => Object.fromEntries(Object.entries(current).filter(([uid]) => uid !== share.uid))),
    );
  };
  const actorName = (uid: string) => (uid === currentUserId ? 'You' : memberLabel(uid));

  const getHistoryLine = (item: RepaidHistoryItem) => {
    if (item.kind === 'reset') {
      return `${actorName(item.byUid)} put this expense back to expected, clearing ${item.count} ${item.count === 1 ? 'mark' : 'marks'}.`;
    }
    const { debtorUid, entry, previous } = item;
    const getSubject = () => {
      if (debtorUid !== entry.byUid) {
        return `${memberLabel(debtorUid)}'s share`;
      }
      return entry.byUid === currentUserId ? 'your own share' : 'their own share';
    };
    const was = !entry.isPaid && previous?.isPaid ? ` ${actorName(previous.byUid)} had marked it paid back.` : '';
    return `${actorName(entry.byUid)} marked ${getSubject()} ${entry.isPaid ? 'paid back' : 'not paid back'}.${was}`;
  };

  return (
    <DetailSheet isOpen={isOpen} onClose={onClose} title="Who's paid you back">
      {expense && (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            {expense.title} · {paidCount} of {shares.length} paid back. Tap a name once you&apos;ve received their
            share.
          </p>
          <div className='bg-background sticky top-0 z-10 -mx-1 space-y-3 px-1 pb-2'>
            <PillGroup
              label='Show'
              isThin
              options={[
                { value: 'owed', label: 'Still owed', detail: String(owedCount) },
                { value: 'paid', label: 'Paid back', detail: String(paidCount) },
                ...(history.length > 0 ? [{ value: 'history' as const, label: 'History', detail: String(history.length) }] : []),
              ]}
              value={shownView}
              onChange={setView}
            />
            {shares.length >= LIST_SEARCH_THRESHOLD && (
              <SearchInput value={query} onChange={setQuery} placeholder='Search people' />
            )}
          </div>
          {shownView !== 'history' &&
            (visibleShares.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {needle !== '' ? 'Nobody matches that.' : shownView === 'owed' ? 'Everyone has paid you back.' : 'Nobody has paid you back yet.'}
              </p>
            ) : (
              <ul className='divide-border divide-y'>
                {visibleShares.map((share) => (
                  <li key={share.uid}>
                    <Button
                      type='button'
                      variant='tertiary'
                      aria-label={`${share.isPaid ? 'Mark not received' : 'Mark received'}: ${memberLabel(share.uid)}`}
                      onClick={() => toggle(share)}
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
            ))}
          {shownView === 'history' &&
            (visibleHistory.length === 0 ? (
              <p className='text-muted-foreground text-sm'>Nothing matches that.</p>
            ) : (
              <>
                <ul className='space-y-2'>
                  {visibleHistory.slice(0, historyCount).map((item) => {
                    const at = item.kind === 'flip' ? item.entry.at : item.at;
                    return (
                      <li
                        key={item.kind === 'flip' ? `${item.debtorUid}-${at}-${item.entry.isPaid}` : `reset-${at}-${item.byUid}`}
                        className='text-sm'
                      >
                        {getHistoryLine(item)}
                        <span className='text-muted-foreground block text-xs'>{formatDateTime(at)}</span>
                      </li>
                    );
                  })}
                </ul>
                {visibleHistory.length > historyCount && (
                  <ShowMoreButton onClick={() => setHistoryCount((count) => count + HISTORY_PAGE)}>
                    Show {Math.min(HISTORY_PAGE, visibleHistory.length - historyCount)} more
                  </ShowMoreButton>
                )}
              </>
            ))}
        </div>
      )}
    </DetailSheet>
  );
}

export default PaidBackSheet;
