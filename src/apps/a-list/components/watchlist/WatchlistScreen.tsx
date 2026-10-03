import SectionHeader from '@/components/SectionHeader';

function WatchlistScreen() {
  return (
    <section className='space-y-4'>
      <SectionHeader title='Watchlist' />
      <p className='text-muted-foreground text-sm'>
        The movies you can't wait to see will line up here.
      </p>
    </section>
  );
}

export default WatchlistScreen;
