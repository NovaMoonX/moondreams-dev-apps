import { Badge, Button, Pagination } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';

import type { CatCondition } from '../types';
import { usePagination } from '../utils/usePagination';

const PAGE_SIZE = 5;

interface CatConditionTimelineProps {
  conditions: CatCondition[];
  title?: string;
  emptyLabel?: string;
  onEdit?: (condition: CatCondition) => void;
}

const STATUS_BADGE_VARIANT: Record<CatCondition['status'], 'warning' | 'accent' | 'success'> = {
  active: 'warning',
  ongoing: 'accent',
  resolved: 'success',
};

function CatConditionTimeline({
  conditions,
  title = 'Conditions',
  emptyLabel = 'No conditions logged yet.',
  onEdit,
}: CatConditionTimelineProps) {
  const sortedConditions = [...conditions].sort((left, right) => right.occurredAt - left.occurredAt);
  const { page, pageCount, setPage, pagedItems, shouldPaginate } = usePagination(sortedConditions, PAGE_SIZE);

  if (sortedConditions.length === 0) {
    return (
      <div>
        <h3 className='text-sm font-medium'>{title}</h3>
        <p className='text-muted-foreground text-sm'>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className='text-sm font-medium pb-1'>{title}</h3>
      <div className='divide-border divide-y'>
        {pagedItems.map((condition) => (
          <div key={condition.id} className='flex items-start justify-between gap-3 py-2 first:pt-0'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <strong className='text-sm'>{condition.name}</strong>
                <Badge variant={STATUS_BADGE_VARIANT[condition.status]} size='xs'>
                  {condition.status}
                </Badge>
              </div>
              <div className='text-muted-foreground text-sm'>
                Occurred: {formatDateTime(condition.occurredAt)}
              </div>
              {condition.resolvedAt ? (
                <div className='text-muted-foreground text-sm'>
                  Resolved: {formatDateTime(condition.resolvedAt)}
                </div>
              ) : null}
              {condition.description ? (
                <div className='text-muted-foreground text-sm'>{condition.description}</div>
              ) : null}
            </div>
            {onEdit && (
              <Button type='button' variant='link' size='sm' onClick={() => onEdit(condition)}>
                Edit
              </Button>
            )}
          </div>
        ))}
      </div>

      {shouldPaginate && (
        <div className='mt-3 flex justify-center'>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} size='sm' />
        </div>
      )}
    </div>
  );
}

export default CatConditionTimeline;
