import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { normalizeString } from '@/utils/stringUtils';
import SectionDivider from '@/components/SectionDivider';
import WatchlistFilters from '@apps/a-list/components/watchlist/WatchlistFilters';
import WatchlistRow from '@apps/a-list/components/watchlist/WatchlistRow';
import { WATCH_PRIORITIES } from '@apps/a-list/constants';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  selectOpeningRows,
  selectWatchlistRows,
} from '@apps/a-list/store/selectors';
import type { WatchlistFilter } from '@apps/a-list/types';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

function WatchlistScreen() {
  const { openOverlay } = useAListOverlay();
  const now = useNow();
  const rows = useAppSelector((state) => selectWatchlistRows(state, now));
  const openingRows = useAppSelector((state) => selectOpeningRows(state, now));
  const [filters, setFilters] = useState<WatchlistFilter[]>([]);
  const [query, setQuery] = useState('');
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;

  const toggleFilter = (filter: WatchlistFilter) =>
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((candidate) => candidate !== filter)
        : [...current, filter],
    );

  const daysByMovie = Object.fromEntries(
    openingRows.map((row) => [row.item.movieKey, row.daysUntil]),
  );

  // Rows arrive in priority order. No pills means everything, unseen first; each pill narrows it.
  const getVisibleRows = (): WatchlistRowData[] => {
    const priorities = filters.filter((filter) =>
      WATCH_PRIORITIES.includes(filter as (typeof WATCH_PRIORITIES)[number]),
    );
    const isOpeningOn = filters.includes('opening');
    const isSeenOn = filters.includes('seen');
    const normalizedQuery = normalizeString(query);
    const matches = rows.filter(
      (row) =>
        normalizeString(row.item.movie.title).includes(normalizedQuery) &&
        (!isOpeningOn || row.item.movieKey in daysByMovie) &&
        (!isSeenOn || row.isSeen) &&
        (priorities.length === 0 ||
          (priorities as string[]).includes(row.item.priority)),
    );

    if (isOpeningOn) {
      return [...matches].sort(
        (left, right) =>
          daysByMovie[left.item.movieKey] - daysByMovie[right.item.movieKey],
      );
    }
    if (isSeenOn) {
      return [...matches].sort(
        (left, right) => (right.lastWatchedAt ?? 0) - (left.lastWatchedAt ?? 0),
      );
    }
    return [
      ...matches.filter((row) => !row.isSeen),
      ...matches.filter((row) => row.isSeen),
    ];
  };

  const visibleRows = getVisibleRows();

  // With no filters on, what opens this week sits above everything else, each under its own divider.
  const getSections = () => {
    const opening = visibleRows.filter(
      (row) => row.item.movieKey in daysByMovie,
    );
    if (filters.length > 0 || opening.length === 0)
      return [{ label: null, rows: visibleRows }];
    return [
      {
        label: 'Opening this week',
        rows: [...opening].sort(
          (left, right) =>
            daysByMovie[left.item.movieKey] - daysByMovie[right.item.movieKey],
        ),
      },
      {
        label: 'Everything else',
        rows: visibleRows.filter((row) => !(row.item.movieKey in daysByMovie)),
      },
    ].filter(({ rows: sectionRows }) => sectionRows.length > 0);
  };

  const sections = getSections();

  const renderRows = (sectionRows: WatchlistRowData[]) => (
    <ul className='space-y-3'>
      {sectionRows.map((row) => (
        <li key={row.item.movieKey}>
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            aria-label={`Open ${row.item.movie.title}`}
            className='text-foreground! h-auto w-full justify-start rounded-2xl text-left font-normal'
            onClick={() =>
              openOverlay({
                kind: 'watchlistItem',
                movieKey: row.item.movieKey,
              })
            }
          >
            <WatchlistRow
              row={row}
              todayDay={todayDay}
              daysUntil={daysByMovie[row.item.movieKey]}
            />
          </Button>
        </li>
      ))}
    </ul>
  );

  const getEmptyState = () => {
    if (rows.length === 0)
      return (
        <p>Nothing on your list yet. Add the movies you can't wait to see.</p>
      );
    if (filters.length > 0 || query.trim() !== '')
      return (
        <p>
          Nothing matches that.{' '}
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0'
            onClick={() => {
              setFilters([]);
              setQuery('');
            }}
          >
            Clear search and filters
          </Button>
        </p>
      );
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
            rounded='full'
            onClick={() =>
              openOverlay({ kind: 'add', destination: 'watchlist' })
            }
          >
            + Add
          </Button>
        }
      />
      {rows.length > 0 && (
        <Input
          type='search'
          variant='outline'
          rounded='full'
          placeholder='Search your watchlist'
          aria-label='Search your watchlist'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <WatchlistFilters
        value={filters}
        openingCount={openingRows.length}
        onToggle={toggleFilter}
        onClear={() => setFilters([])}
      />
      {visibleRows.length === 0 ? (
        <div className='text-muted-foreground text-sm'>{getEmptyState()}</div>
      ) : (
        sections.map(({ label, rows: sectionRows }) => (
          <div key={label ?? 'all'} className='space-y-3'>
            {label && <SectionDivider label={label} />}
            {renderRows(sectionRows)}
          </div>
        ))
      )}
    </section>
  );
}

export default WatchlistScreen;
