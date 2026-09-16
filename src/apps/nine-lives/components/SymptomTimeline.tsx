import { Badge, Button, Pagination } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';
import type { CatCondition, Symptom } from '@apps/nine-lives/types';
import { usePagination } from '@apps/nine-lives/utils/usePagination';

const PAGE_SIZE = 5;

const symptomTagLabels: Record<string, string> = {
  litter_box_change: 'Litter box change',
  appetite_change: 'Appetite change',
  vomiting: 'Vomiting',
  lethargy: 'Lethargy',
  hiding: 'Hiding',
  playfulness_change: 'Playfulness change',
  grooming_change: 'Grooming change',
  other: 'Other',
};

interface SymptomTimelineProps {
  symptoms: Symptom[];
  conditions?: CatCondition[];
  title?: string;
  emptyLabel?: string;
  onEdit?: (symptom: Symptom) => void;
}

function SymptomTimeline({
  symptoms,
  conditions = [],
  title = 'Symptoms',
  emptyLabel = 'No symptoms logged yet.',
  onEdit,
}: SymptomTimelineProps) {
  const sortedSymptoms = [...symptoms].sort(
    (left, right) => right.firstNoticedAt - left.firstNoticedAt,
  );
  const { page, pageCount, setPage, pagedItems, shouldPaginate } = usePagination(sortedSymptoms, PAGE_SIZE);

  if (sortedSymptoms.length === 0) {
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
        {pagedItems.map((symptom) => (
          <div key={symptom.id} className='flex items-start justify-between gap-3 py-2 first:pt-0'>
            <div className='min-w-0'>
              <div className='flex flex-wrap gap-1 pb-1'>
                {symptom.quickTags.length > 0 ? (
                  symptom.quickTags.map((tag) => (
                    <Badge key={`${symptom.id}-${tag}`} variant='muted' outline size='xs'>
                      {symptomTagLabels[tag] ?? tag}
                    </Badge>
                  ))
                ) : (
                  <span className='text-muted-foreground text-xs'>Free text only</span>
                )}
              </div>

              <strong className='text-sm'>First noticed: {formatDateTime(symptom.firstNoticedAt)}</strong>
              {symptom.description ? (
                <div className='text-muted-foreground text-sm'>{symptom.description}</div>
              ) : null}
              {symptom.severity ? (
                <div className='text-muted-foreground text-sm'>Severity: {symptom.severity}</div>
              ) : null}
              {symptom.linkedConditionId ? (
                <div className='text-muted-foreground text-sm'>
                  Linked condition:{' '}
                  {conditions.find((condition) => condition.id === symptom.linkedConditionId)?.name ??
                    'Unknown'}
                </div>
              ) : null}
            </div>

            {onEdit && (
              <Button type='button' variant='link' size='sm' onClick={() => onEdit(symptom)}>
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

export default SymptomTimeline;
