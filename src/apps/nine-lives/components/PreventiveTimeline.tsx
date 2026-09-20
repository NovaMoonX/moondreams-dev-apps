import { Button, DropdownMenu, DropdownMenuFactories, Pagination } from '@moondreamsdev/dreamer-ui/components';
import { DotsVertical } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatDateTime } from '@/utils/formatUtils';
import type { Cat, CustomPreventiveType, Preventive } from '@apps/nine-lives/types';
import { usePagination } from '@apps/nine-lives/utils/usePagination';

const PAGE_SIZE = 5;
const { option } = DropdownMenuFactories;

interface PreventiveTimelineProps {
  preventives: Preventive[];
  customTypes: CustomPreventiveType[];
  /** When provided along with `catId`, entries assigned to more than one cat note the others by name. */
  cats?: Cat[];
  catId?: string;
  /** The id of the record whose modal is currently open (from any trigger) — highlights that row. */
  activeRecordId?: string | null;
  /** Hides the action menu, for read-only contexts like a dose-history view. */
  readOnly?: boolean;
  onEdit?: (preventive: Preventive) => void;
  onLogDose?: (preventive: Preventive) => void;
  onViewHistory?: (preventive: Preventive) => void;
}

const TYPE_LABELS: Record<Exclude<Preventive['type'], 'custom'>, string> = {
  'flea-tick': 'Flea / tick',
  heartworm: 'Heartworm',
  mite: 'Mite',
  dewormer: 'Dewormer',
  medication: 'Medication',
  other: 'Other',
};

function getPreventiveTypeLabel(preventive: Preventive, customTypes: CustomPreventiveType[]): string {
  if (preventive.type === 'custom') {
    const customType = customTypes.find((type) => type.id === preventive.customTypeId);
    return customType?.label ?? 'Custom';
  }

  return TYPE_LABELS[preventive.type];
}

function PreventiveTimeline({
  preventives,
  customTypes,
  cats = [],
  catId,
  activeRecordId = null,
  readOnly = false,
  onEdit,
  onLogDose,
  onViewHistory,
}: PreventiveTimelineProps) {
  const sortedPreventives = [...preventives].sort(
    (left, right) => right.lastAdministeredAt - left.lastAdministeredAt,
  );
  const { page, pageCount, setPage, pagedItems, shouldPaginate } = usePagination(sortedPreventives, PAGE_SIZE);

  if (sortedPreventives.length === 0) {
    return <p className='text-muted-foreground text-sm'>No preventive doses logged yet.</p>;
  }

  const menuItems = [
    ...(onEdit ? [option({ label: 'Edit', value: 'edit' })] : []),
    ...(onLogDose ? [option({ label: 'Mark administered today', value: 'log-dose' })] : []),
    ...(onViewHistory ? [option({ label: 'View history', value: 'view-history' })] : []),
  ];

  return (
    <div>
      <div className='divide-border divide-y'>
      {pagedItems.map((preventive) => {
        const latestDose = preventive.history[0];

        return (
          <div
            key={preventive.id}
            className={join(
              'flex items-start justify-between gap-3 py-3 pl-3 first:pt-0 -ml-3',
              preventive.id === activeRecordId && 'border-l-2 border-l-primary bg-primary/5',
            )}
          >
            <div className='min-w-0'>
              <strong className='text-sm'>{preventive.name}</strong>
              <div className='text-muted-foreground text-sm'>
                {getPreventiveTypeLabel(preventive, customTypes)}
              </div>
              <div className='text-muted-foreground text-sm'>
                Last administered: {formatDateTime(preventive.lastAdministeredAt)}
              </div>
              {preventive.expiresAt ? (
                <div className='text-primary text-sm font-medium'>
                  Next due: {formatDateTime(preventive.expiresAt)}
                </div>
              ) : null}
              {latestDose?.dosage ? (
                <div className='text-muted-foreground text-sm'>Dosage: {latestDose.dosage}</div>
              ) : null}
              {preventive.catIds.length > 1 ? (
                <div className='text-muted-foreground text-sm'>
                  Also given to:{' '}
                  {preventive.catIds
                    .filter((id) => id !== catId)
                    .map((id) => cats.find((cat) => cat.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </div>
              ) : null}
            </div>
            {!readOnly && menuItems.length > 0 && (
              <DropdownMenu
                items={menuItems}
                onItemSelect={(value) => {
                  if (value === 'edit') {
                    onEdit?.(preventive);
                  } else if (value === 'log-dose') {
                    onLogDose?.(preventive);
                  } else if (value === 'view-history') {
                    onViewHistory?.(preventive);
                  }
                }}
                placement='bottom'
                alignment='end'
                offset={8}
                trigger={
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    className='h-8 w-8 p-0'
                    aria-label={`Open actions for ${preventive.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <DotsVertical className='h-4 w-4' />
                  </Button>
                }
              />
            )}
          </div>
        );
      })}
      </div>

      {shouldPaginate && (
        <div className='mt-3 flex justify-center'>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} size='sm' showFirstLast={pageCount >= 5} />
        </div>
      )}
    </div>
  );
}

export default PreventiveTimeline;
