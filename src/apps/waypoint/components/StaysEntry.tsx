import { BedDouble } from 'lucide-react';

import { useAppSelector } from '@/store';

import SectionEntryRow from '@apps/waypoint/components/SectionEntryRow';
import { selectStays } from '@apps/waypoint/store/selectors';

interface StaysEntryProps {
  onOpen: () => void;
}

function StaysEntry({ onOpen }: StaysEntryProps) {
  const stays = useAppSelector(selectStays);
  const [firstStay] = stays;

  const title = firstStay
    ? `${firstStay.name}${stays.length > 1 ? ` + ${stays.length - 1} more` : ''}`
    : 'Add your stays';
  const summary = firstStay
    ? `${stays.length} ${stays.length === 1 ? 'stay' : 'stays'}`
    : 'Share where the group is staying — hotels, rentals, campgrounds, etc.';

  return (
    <SectionEntryRow
      heading='Stays'
      icon={<BedDouble className='h-5 w-5' />}
      title={title}
      summary={summary}
      onOpen={onOpen}
    />
  );
}

export default StaysEntry;
