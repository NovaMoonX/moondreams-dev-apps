import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';

import type { Cat, Visit } from '../types';
import { getDefaultVisitTitle } from '../utils/dateHelpers';

interface VisitTimelineProps {
  visits: Visit[];
  cats?: Cat[];
  title?: string;
  emptyLabel?: string;
  onEdit?: (visit: Visit) => void;
  onComplete?: (visit: Visit) => void;
}

const STATUS_VARIANTS: Record<Visit['status'], 'accent' | 'success' | 'warning'> = {
  upcoming: 'accent',
  completed: 'success',
  cancelled: 'warning',
};

const REASON_LABELS: Record<Visit['reason'], string> = {
  checkup: 'Checkup',
  illness: 'Illness',
  accident: 'Accident',
  vaccination: 'Vaccination',
  follow_up: 'Follow-up',
  custom: 'Custom',
};

function VisitTimeline({
  visits,
  cats = [],
  title = 'Visits',
  emptyLabel = 'No visits scheduled yet.',
  onEdit,
  onComplete,
}: VisitTimelineProps) {
  const sortedVisits = [...visits].sort((left, right) => right.scheduledAt - left.scheduledAt);

  if (sortedVisits.length === 0) {
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
        {sortedVisits.map((visit) => {
          const catNames = visit.catIds
            .map((catId) => cats.find((cat) => cat.id === catId)?.name)
            .filter(Boolean)
            .join(', ');
          const linkedCount =
            visit.linkedVaccinationIds.length +
            visit.linkedWeightEntryIds.length +
            visit.linkedConditionIds.length +
            visit.linkedSymptomIds.length;

          return (
            <div key={visit.id} className='flex items-start justify-between gap-3 py-3 first:pt-0'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <strong className='text-sm'>{visit.title ?? getDefaultVisitTitle(visit.scheduledAt)}</strong>
                  <Badge variant={STATUS_VARIANTS[visit.status]} size='xs'>
                    {visit.status}
                  </Badge>
                </div>
                <div className='text-muted-foreground text-sm'>
                  {formatDateTime(visit.scheduledAt)}
                  {catNames ? ` · ${catNames}` : ''}
                </div>
                <div className='text-muted-foreground text-sm'>
                  {visit.reason === 'custom' ? visit.customReasonLabel : REASON_LABELS[visit.reason]}
                  {visit.followUpNote ? ` · ${visit.followUpNote}` : ''}
                </div>
                {linkedCount > 0 && (
                  <div className='text-muted-foreground text-xs'>
                    {linkedCount} outcome {linkedCount === 1 ? 'entry' : 'entries'}
                  </div>
                )}
              </div>
              <div className='flex shrink-0 items-center gap-2'>
                {onComplete && visit.status === 'upcoming' && (
                  <Button type='button' variant='link' size='sm' onClick={() => onComplete(visit)}>
                    Complete
                  </Button>
                )}
                {onEdit && (
                  <Button type='button' variant='link' size='sm' onClick={() => onEdit(visit)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VisitTimeline;
