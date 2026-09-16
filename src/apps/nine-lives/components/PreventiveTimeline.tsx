import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';
import type { Cat, CustomPreventiveType, Preventive } from '@apps/nine-lives/types';

interface PreventiveTimelineProps {
  preventives: Preventive[];
  customTypes: CustomPreventiveType[];
  /** When provided along with `catId`, entries assigned to more than one cat note the others by name. */
  cats?: Cat[];
  catId?: string;
  onEdit?: (preventive: Preventive) => void;
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

function PreventiveTimeline({ preventives, customTypes, cats = [], catId, onEdit }: PreventiveTimelineProps) {
  const sortedPreventives = [...preventives].sort(
    (left, right) => right.administeredAt - left.administeredAt,
  );

  if (sortedPreventives.length === 0) {
    return <p className='text-muted-foreground text-sm'>No preventive doses logged yet.</p>;
  }

  return (
    <div className='divide-border divide-y'>
      {sortedPreventives.map((preventive) => (
        <div key={preventive.id} className='flex items-start justify-between gap-3 py-3 first:pt-0'>
          <div className='min-w-0'>
            <strong className='text-sm'>{preventive.name}</strong>
            <div className='text-muted-foreground text-sm'>
              {getPreventiveTypeLabel(preventive, customTypes)}
            </div>
            <div className='text-muted-foreground text-sm'>
              Last administered: {formatDateTime(preventive.administeredAt)}
            </div>
            {preventive.expiresAt ? (
              <div className='text-primary text-sm font-medium'>
                Next due: {formatDateTime(preventive.expiresAt)}
              </div>
            ) : null}
            {preventive.dosage ? (
              <div className='text-muted-foreground text-sm'>Dosage: {preventive.dosage}</div>
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
          {onEdit ? (
            <Button type='button' variant='link' size='sm' onClick={() => onEdit(preventive)}>
              Edit
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default PreventiveTimeline;
