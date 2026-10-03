interface PastMoviesStripProps {
  count: number;
  lastTitle: string;
}

function PastMoviesStrip({ count, lastTitle }: PastMoviesStripProps) {
  return (
    <p
      className='bg-accent text-accent-foreground mb-3 rounded-full px-4 py-2 text-sm font-medium'
      role='status'
    >
      🎟️ {lastTitle} added · {count} so far
    </p>
  );
}

export default PastMoviesStrip;
