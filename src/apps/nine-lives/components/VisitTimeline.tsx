import { useMemo, useState } from 'react';

import {
  Badge,
  Button,
  Input,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, ChevronUp } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

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
  onReopen?: (visit: Visit) => void;
}

type StatusFilter = 'all' | Visit['status'];

const STATUS_VARIANTS: Record<
  Visit['status'],
  'accent' | 'success' | 'warning'
> = {
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

const STATUS_FILTER_OPTIONS = [
  { text: 'All statuses', value: 'all' },
  { text: 'Upcoming', value: 'upcoming' },
  { text: 'Completed', value: 'completed' },
  { text: 'Cancelled', value: 'cancelled' },
];

function getVisitReasonLabel(visit: Visit) {
  return visit.reason === 'custom'
    ? (visit.customReasonLabel ?? '')
    : REASON_LABELS[visit.reason];
}

function VisitTimeline({
  visits,
  cats = [],
  title = 'Visits',
  emptyLabel = 'No visits scheduled yet.',
  onEdit,
  onComplete,
  onReopen,
}: VisitTimelineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const catFilterOptions = useMemo(
    () => [
      { text: 'All cats', value: 'all' },
      ...cats.map((cat) => ({ text: cat.name, value: cat.id })),
    ],
    [cats],
  );

  const visibleVisits = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = visits.filter((visit) => {
      if (statusFilter !== 'all' && visit.status !== statusFilter) {
        return false;
      }

      if (catFilter !== 'all' && !visit.catIds.includes(catFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const catNames = visit.catIds
        .map((catId) => cats.find((cat) => cat.id === catId)?.name ?? '')
        .join(' ');
      const searchableText = [
        visit.title ?? getDefaultVisitTitle(visit.scheduledAt),
        getVisitReasonLabel(visit),
        visit.followUpNote ?? '',
        catNames,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });

    const sorted = [...filtered].sort((left, right) =>
      sortDirection === 'desc'
        ? right.scheduledAt - left.scheduledAt
        : left.scheduledAt - right.scheduledAt,
    );

    return sorted;
  }, [visits, cats, searchQuery, statusFilter, catFilter, sortDirection]);

  const hasVisits = visits.length > 0;

  return (
    <div>
      <h3 className='text-sm font-medium'>{title}</h3>

      {hasVisits && (
        <div className='mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2'>
          <div className='min-w-40 flex-1'>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder='Search visits'
              variant='outline'
            />
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-muted-foreground text-sm'>Filter by:</span>
            <div className='max-w-40 flex-1'>
              <Select
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                size='sm'
              />
            </div>
            {cats.length > 1 && (
              <div className='max-w-36 flex-1'>
                <Select
                  options={catFilterOptions}
                  value={catFilter}
                  onChange={setCatFilter}
                  size='sm'
                />
              </div>
            )}
          </div>

          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>Sort by:</span>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='gap-1'
              onClick={() =>
                setSortDirection((current) =>
                  current === 'desc' ? 'asc' : 'desc',
                )
              }
            >
              Date
              {sortDirection === 'desc' ? (
                <ChevronDown className='h-4 w-4' />
              ) : (
                <ChevronUp className='h-4 w-4' />
              )}
            </Button>
          </div>
        </div>
      )}

      {visibleVisits.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {hasVisits ? 'No visits match your search or filters.' : emptyLabel}
        </p>
      ) : (
        <div className={join('divide-border divide-y', hasVisits && 'mt-0')}>
          {visibleVisits.map((visit) => {
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
              <div
                key={visit.id}
                className='flex items-start justify-between gap-3 py-3 first:pt-0'
              >
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <strong className='text-sm'>
                      {visit.title ?? getDefaultVisitTitle(visit.scheduledAt)}
                    </strong>
                    <Badge variant={STATUS_VARIANTS[visit.status]} size='xs'>
                      {visit.status}
                    </Badge>
                  </div>
                  <div className='text-muted-foreground text-sm'>
                    {formatDateTime(visit.scheduledAt)}
                    {catNames ? ` · ${catNames}` : ''}
                  </div>
                  <div className='text-muted-foreground text-sm'>
                    {getVisitReasonLabel(visit)}
                    {visit.followUpNote ? ` · ${visit.followUpNote}` : ''}
                  </div>
                  {linkedCount > 0 && (
                    <div className='text-muted-foreground text-xs'>
                      {linkedCount} outcome{' '}
                      {linkedCount === 1 ? 'entry' : 'entries'}
                    </div>
                  )}
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  {onComplete && visit.status === 'upcoming' && (
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      onClick={() => onComplete(visit)}
                    >
                      Complete
                    </Button>
                  )}
                  {onReopen && visit.status === 'cancelled' && (
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      onClick={() => onReopen(visit)}
                    >
                      Reopen
                    </Button>
                  )}
                  {onEdit && (
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      onClick={() => onEdit(visit)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default VisitTimeline;
