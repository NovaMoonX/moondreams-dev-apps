interface PastMoviesStripProps {
  count: number;
  lastTitle: string;
  emoji?: string;
}

function PastMoviesStrip({
  count,
  lastTitle,
  emoji = '🎟️',
}: PastMoviesStripProps) {
  return (
    <p
      className='bg-accent text-accent-foreground mb-3 rounded-full px-4 py-2 text-sm font-medium'
      role='status'
    >
      {emoji} {lastTitle} added · {count} so far
    </p>
  );
}

export default PastMoviesStrip;
