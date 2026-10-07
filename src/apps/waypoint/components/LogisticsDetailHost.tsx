import { useImperativeHandle, useState, type Ref } from 'react';

import { useAppSelector } from '@/store';
import LogisticsDetailSheet from '@apps/waypoint/components/LogisticsDetailSheet';
import { selectRentals, selectStays } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import type { LogisticsEntry } from '@apps/waypoint/utils/timelineLogistics';

export interface LogisticsDetailHandle {
  open: (entry: LogisticsEntry) => void;
}

interface LogisticsDetailHostProps {
  trip: TripSpace;
  handleRef: Ref<LogisticsDetailHandle>;
}

// Its open state lives here, not in the timeline, so a tap doesn't re-render every day of a big trip.
function LogisticsDetailHost({ trip, handleRef }: LogisticsDetailHostProps) {
  const [entry, setEntry] = useState<LogisticsEntry | null>(null);
  const stays = useAppSelector(selectStays);
  const rentals = useAppSelector(selectRentals);
  useImperativeHandle(handleRef, () => ({ open: setEntry }), []);

  const stay = entry?.subject.kind === 'STAY' ? stays.find((item) => item.id === entry.subject.id) : undefined;
  const rental = entry?.subject.kind === 'RENTAL' ? rentals.find((item) => item.id === entry.subject.id) : undefined;
  const subject = stay ? { stay } : rental ? { rental } : null;

  return <LogisticsDetailSheet trip={trip} subject={subject} onClose={() => setEntry(null)} />;
}

export default LogisticsDetailHost;
