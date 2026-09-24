import {
  DropdownMenuFactories,
  Pagination,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import { formatDateTime } from '@/utils/formatUtils';
import type { Vaccination } from '@apps/nine-lives/types';
import { usePagination } from '@apps/nine-lives/utils/usePagination';

const PAGE_SIZE = 5;
const { option } = DropdownMenuFactories;

interface VaccinationTimelineProps {
  vaccinations: Vaccination[];
  title?: string;
  emptyLabel?: string;
  /** The id of the record whose modal is currently open (from any trigger) — highlights that row. */
  activeRecordId?: string | null;
  /** Hides the action menu, for read-only contexts like a dose-history view. */
  readOnly?: boolean;
  onEdit?: (vaccination: Vaccination) => void;
  onLogDose?: (vaccination: Vaccination) => void;
  onViewHistory?: (vaccination: Vaccination) => void;
}

function VaccinationTimeline({
  vaccinations,
  title = 'Vaccinations',
  emptyLabel = 'No vaccinations logged yet.',
  activeRecordId = null,
  readOnly = false,
  onEdit,
  onLogDose,
  onViewHistory,
}: VaccinationTimelineProps) {
  const sortedVaccinations = [...vaccinations].sort(
    (left, right) => right.lastAdministeredAt - left.lastAdministeredAt,
  );
  const { page, pageCount, setPage, pagedItems, shouldPaginate } =
    usePagination(sortedVaccinations, PAGE_SIZE);

  if (sortedVaccinations.length === 0) {
    return (
      <div>
        <h3 className='text-sm font-medium'>{title}</h3>
        <p className='text-muted-foreground text-sm'>{emptyLabel}</p>
      </div>
    );
  }

  const menuItems = [
    ...(onEdit ? [option({ label: 'Edit', value: 'edit' })] : []),
    ...(onLogDose
      ? [option({ label: 'Mark administered today', value: 'log-dose' })]
      : []),
    ...(onViewHistory
      ? [option({ label: 'View history', value: 'view-history' })]
      : []),
  ];

  return (
    <div>
      <h3 className='text-sm font-medium'>{title}</h3>
      <div className='divide-border divide-y'>
        {pagedItems.map((vaccination) => {
          const latestDose = vaccination.history[0];

          return (
            <div
              key={vaccination.id}
              className={join(
                '-ml-3 flex items-start justify-between gap-3 py-2 pl-3 first:pt-0',
                vaccination.id === activeRecordId &&
                  'border-l-primary bg-primary/5 border-l-2',
              )}
            >
              <div className='min-w-0'>
                <strong className='text-sm'>{vaccination.name}</strong>
                <div className='text-muted-foreground text-sm'>
                  Last administered:{' '}
                  {formatDateTime(vaccination.lastAdministeredAt)}
                </div>
                {vaccination.expiresAt ? (
                  <div className='text-primary text-sm font-medium'>
                    Next due: {formatDateTime(vaccination.expiresAt)}
                  </div>
                ) : null}
                {latestDose?.lotNumber ? (
                  <div className='text-muted-foreground text-sm'>
                    Lot: {latestDose.lotNumber}
                  </div>
                ) : null}
              </div>
              {!readOnly && menuItems.length > 0 && (
                <EllipsisDropdown
                  items={menuItems}
                  onItemSelect={(value) => {
                    if (value === 'edit') {
                      onEdit?.(vaccination);
                    } else if (value === 'log-dose') {
                      onLogDose?.(vaccination);
                    } else if (value === 'view-history') {
                      onViewHistory?.(vaccination);
                    }
                  }}
                  ariaLabel={`Open actions for ${vaccination.name}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {shouldPaginate && (
        <div className='mt-3 flex justify-center'>
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
            size='sm'
            showFirstLast={pageCount >= 5}
          />
        </div>
      )}
    </div>
  );
}

export default VaccinationTimeline;
