import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import WatchlistRow from '@apps/a-list/components/watchlist/WatchlistRow';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectWatchlistItems } from '@apps/a-list/store/selectors';

function WatchlistScreen() {
  const { openOverlay } = useAListOverlay();
  const items = useAppSelector(selectWatchlistItems);
  const now = useNow();
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;

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
      {items.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Nothing on your list yet. Add the movies you can't wait to see.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {items.map((item) => (
            <li key={item.movieKey}>
              <WatchlistRow item={item} todayDay={todayDay} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default WatchlistScreen;
