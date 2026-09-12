import StatTile from './StatTile';

function StatsSummary() {
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <StatTile label='Visits so far' value={0} />
      <StatTile label='Total cost so far' value='$0' />
    </div>
  );
}

export default StatsSummary;
