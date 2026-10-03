import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';

function WatchlistScreen() {
  const { openOverlay } = useAListOverlay();

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
      <p className='text-muted-foreground text-sm'>
        The movies you can't wait to see will line up here.
      </p>
    </section>
  );
}

export default WatchlistScreen;
