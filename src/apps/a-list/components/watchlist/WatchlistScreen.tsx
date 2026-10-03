import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import WatchlistRow from '@apps/a-list/components/watchlist/WatchlistRow';
import WatchlistTabs from '@apps/a-list/components/watchlist/WatchlistTabs';
import { WATCH_PRIORITIES } from '@apps/a-list/constants';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  selectOpeningRows,
  selectWatchlistRows,
} from '@apps/a-list/store/selectors';
import type { WatchlistTab } from '@apps/a-list/types';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

const byReleaseDate = (left: WatchlistRowData, right: WatchlistRowData) =>
  (left.item.movie.releaseDate ?? Number.POSITIVE_INFINITY) -
  (right.item.movie.releaseDate ?? Number.POSITIVE_INFINITY);

function WatchlistScreen() {
  const { openOverlay } = useAListOverlay();
  const now = useNow();
  const rows = useAppSelector((state) => selectWatchlistRows(state, now));
  const openingRows = useAppSelector((state) => selectOpeningRows(state, now));
  const [tab, setTab] = useState<WatchlistTab>('opening');
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;

  // Rows arrive in priority order; each tab filters (and, for some, re-sorts) them.
  const getTabRows = (): WatchlistRowData[] => {
    if (tab === 'all') {
      return [
        ...rows.filter((row) => !row.isSeen),
        ...rows.filter((row) => row.isSeen),
      ];
    }
    if (tab === 'seen') {
      return rows
        .filter((row) => row.isSeen)
        .sort(
          (left, right) =>
            (right.lastWatchedAt ?? 0) - (left.lastWatchedAt ?? 0),
        );
    }
    if (WATCH_PRIORITIES.includes(tab as (typeof WATCH_PRIORITIES)[number])) {
      return rows
        .filter((row) => !row.isSeen && row.item.priority === tab)
        .sort(byReleaseDate);
    }
    return openingRows;
  };

  const tabRows = getTabRows();
  const daysByMovie = Object.fromEntries(
    openingRows.map((row) => [row.item.movieKey, row.daysUntil]),
  );

  const getEmptyState = () => {
    if (rows.length === 0)
      return (
        <p>Nothing on your list yet. Add the movies you can't wait to see.</p>
      );
    if (tab === 'opening') {
      return (
        <p>
          Nothing opens in the next week.{' '}
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0'
            onClick={() => setTab('all')}
          >
            See everything
          </Button>
        </p>
      );
    }
    if (tab === 'seen') return <p>Movies you've watched will land here.</p>;
    return <p>Nothing here right now.</p>;
  };

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Watchlist'
        action={
          <Button
            type='button'
            size='sm'
            onClick={() =>
              openOverlay({ kind: 'add', destination: 'watchlist' })
            }
          >
            + Add
          </Button>
        }
      />
      <WatchlistTabs
        value={tab}
        openingCount={openingRows.length}
        onChange={setTab}
      />
      {tabRows.length === 0 ? (
        <div className='text-muted-foreground text-sm'>{getEmptyState()}</div>
      ) : (
        <ul className='divide-border divide-y'>
          {tabRows.map((row) => (
            <li key={row.item.movieKey}>
              <WatchlistRow
                row={row}
                todayDay={todayDay}
                daysUntil={
                  tab === 'opening' ? daysByMovie[row.item.movieKey] : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default WatchlistScreen;
