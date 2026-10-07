import { formatClockTime } from '@/utils/formatUtils';
import SlimTimelineRow from '@apps/waypoint/components/SlimTimelineRow';
import type { LogisticsEntry } from '@apps/waypoint/utils/timelineLogistics';

function LogisticsRow({ entry, onOpen }: { entry: LogisticsEntry; onOpen: (entry: LogisticsEntry) => void }) {
  return (
    <SlimTimelineRow
      emoji={entry.emoji}
      label={entry.verb}
      name={entry.name}
      time={entry.time ? formatClockTime(entry.time) : undefined}
      ariaLabel={`Open details: ${entry.verb} ${entry.name}`}
      onOpen={() => onOpen(entry)}
    />
  );
}

export default LogisticsRow;
