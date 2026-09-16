import { Button, Pagination } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';
import type { WeightEntry } from '@apps/nine-lives/types';
import { usePagination } from '@apps/nine-lives/utils/usePagination';

const PAGE_SIZE = 5;

interface WeightHistoryListProps {
  entries: WeightEntry[];
  title?: string;
  emptyLabel?: string;
  onEdit?: (entry: WeightEntry) => void;
}

function WeightHistoryList({
  entries,
  title = 'Weight history',
  emptyLabel = 'No weight entries yet.',
  onEdit,
}: WeightHistoryListProps) {
  const sortedEntries = [...entries].sort(
    (left, right) => right.measuredAt - left.measuredAt,
  );
  const { page, pageCount, setPage, pagedItems, shouldPaginate } = usePagination(sortedEntries, PAGE_SIZE);

  if (sortedEntries.length === 0) {
    return (
      <div>
        <h3 className='text-sm font-medium'>{title}</h3>
        <p className='text-muted-foreground text-sm'>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className='text-sm font-medium'>{title}</h3>
      <div className='divide-border divide-y'>
        {pagedItems.map((entry) => (
          <div key={entry.id} className='flex items-center justify-between gap-3 py-2 first:pt-0'>
            <div className='min-w-0'>
              <strong className='text-sm'>
                {entry.weight} {entry.unit}
              </strong>
              <div className='text-muted-foreground text-sm'>Measured: {formatDateTime(entry.measuredAt)}</div>
            </div>
            {onEdit && (
              <Button type='button' variant='link' size='sm' onClick={() => onEdit(entry)}>
                Edit
              </Button>
            )}
          </div>
        ))}
      </div>

      {shouldPaginate && (
        <div className='mt-3 flex justify-center'>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} size='sm' showFirstLast={pageCount >= 5} />
        </div>
      )}
    </div>
  );
}

export default WeightHistoryList;
