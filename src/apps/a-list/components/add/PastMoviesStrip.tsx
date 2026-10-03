interface PastMoviesStripProps {
  count: number;
  lastTitle: string;
}

function PastMoviesStrip({ count, lastTitle }: PastMoviesStripProps) {
  return (
    <p
      className='bg-success/10 text-success mb-3 rounded-lg px-3 py-2 text-sm font-medium'
      role='status'
    >
      ✓ {lastTitle} added · {count} so far
    </p>
  );
}

export default PastMoviesStrip;
