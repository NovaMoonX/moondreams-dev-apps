import { useState } from 'react';

import SearchInput from '@/components/SearchInput';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { DAYS_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import { getMonthStart } from '@apps/runway/engine/closings';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  selectHistoryListedDays,
  selectIsHistoryReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getHistoryRange } from '@apps/runway/utils/historyWindow';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const shortMonth = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

interface EarlierDaysViewProps {
  month: string;
}

/** The confirmed income days of one month before the recent window, read when it is chosen and only looked at. */
function EarlierDaysView({ month }: EarlierDaysViewProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const { openDay } = useRunwayUrlState();
  const [query, setQuery] = useState('');
  const recentFrom = useAppSelector(selectRecentFrom);
  const key = recentFrom === null ? '' : getHistoryRange(month, recentFrom).key;
  const isReady = useAppSelector(
    (state) => key !== '' && selectIsHistoryReady(state, key),
  );
  const hasFailed = useAppSelector(
    (state) => key !== '' && state.runway.historyFailedFor === key,
  );
  const days = useAppSelector((state) => selectHistoryListedDays(state, today));

  const start = getMonthStart(month);
  const needle =
    days.length >= RUNWAY_SEARCH_THRESHOLD ? query.trim().toLowerCase() : '';
  const matches = days.filter(
    (day) =>
      needle === '' ||
      `${day.sourceName ?? ''} ${day.payLineName} ${formatDateUTC(day.on)}`
        .toLowerCase()
        .includes(needle),
  );

  const getBody = () => {
    if (hasFailed && !isReady) {
      return (
        <p className='text-muted-foreground text-sm'>
          {DAYS_WORDS.failedMonth}
        </p>
      );
    }
    if (!isReady) {
      return (
        <p className='text-muted-foreground text-sm'>
          {DAYS_WORDS.loadingMonth}
        </p>
      );
    }
    if (days.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>{DAYS_WORDS.emptyMonth}</p>
      );
    }
    return (
      <div className='space-y-3'>
        {days.length >= RUNWAY_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={`Search ${shortMonth.format(start)}`}
          />
        )}
        {matches.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{DAYS_WORDS.noMatch}</p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {matches.map((day) => (
              <IncomeDayCard
                key={day.dayKey}
                day={day}
                isConfirmedShown={false}
                onOpen={() => openDay(day.dayKey)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  };

  return <div className='space-y-3'>{getBody()}</div>;
}

export default EarlierDaysView;
