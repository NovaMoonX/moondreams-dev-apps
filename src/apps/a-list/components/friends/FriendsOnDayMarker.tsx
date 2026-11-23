import { Users } from 'lucide-react';

interface FriendsOnDayMarkerProps {
  count: number;
}

/** A quiet mark on a cell: a ring in the bottom-left corner on a phone, where a narrow cell's date chip leaves the top no room, and a small pill with the count in the top-right from `sm`. */
function FriendsOnDayMarker({ count }: FriendsOnDayMarkerProps) {
  const label =
    count === 1 ? '1 friend has plans' : `${count} friends have plans`;

  return (
    <span className='pointer-events-none absolute bottom-1 left-1 sm:top-1 sm:right-1 sm:bottom-auto sm:left-auto'>
      <span className='sr-only'>{label}</span>
      <span
        aria-hidden='true'
        className='bg-background ring-foreground/40 block size-2.5 rounded-full ring-1 sm:hidden'
      />
      <span
        aria-hidden='true'
        className='bg-background/90 text-muted-foreground ring-border hidden h-4 items-center gap-0.5 rounded-full px-1 text-[10px] font-semibold ring-1 sm:flex'
      >
        <Users className='size-2.5' />
        {count}
      </span>
    </span>
  );
}

export default FriendsOnDayMarker;
