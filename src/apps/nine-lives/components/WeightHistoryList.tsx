import { formatDateTime } from '@/utils/formatUtils';
import type { WeightEntry } from '@apps/nine-lives/types';

interface WeightHistoryListProps {
  entries: WeightEntry[];
  title?: string;
  emptyLabel?: string;
}

function WeightHistoryList({
  entries,
  title = 'Weight history',
  emptyLabel = 'No weight entries yet.',
}: WeightHistoryListProps) {
  const sortedEntries = [...entries].sort(
    (left, right) => right.measuredAt - left.measuredAt,
  );

  if (sortedEntries.length === 0) {
    return (
      <div>
        <h3>{title}</h3>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <h3>{title}</h3>
      <div>
        {sortedEntries.map((entry) => (
          <div key={entry.id}>
            <div>
              <strong>{entry.weight} {entry.unit}</strong>
            </div>
            <div>Measured: {formatDateTime(entry.measuredAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WeightHistoryList;
