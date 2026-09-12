interface StatTileProps {
  label: string;
  value: string | number;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className='rounded-lg border border-border bg-card p-4 text-center sm:text-left'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <p className='mt-2 text-2xl font-semibold'>{value}</p>
    </div>
  );
}

export default StatTile;
