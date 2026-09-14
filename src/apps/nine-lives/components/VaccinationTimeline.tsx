import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';
import type { Vaccination } from '@apps/nine-lives/types';

interface VaccinationTimelineProps {
  vaccinations: Vaccination[];
  title?: string;
  emptyLabel?: string;
  onEdit?: (vaccination: Vaccination) => void;
}

function VaccinationTimeline({
  vaccinations,
  title = 'Vaccinations',
  emptyLabel = 'No vaccinations logged yet.',
  onEdit,
}: VaccinationTimelineProps) {
  const sortedVaccinations = [...vaccinations].sort(
    (left, right) => right.administeredAt - left.administeredAt,
  );

  if (sortedVaccinations.length === 0) {
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
        {sortedVaccinations.map((vaccination) => (
          <div key={vaccination.id} className='flex items-start justify-between gap-3 py-2 first:pt-0'>
            <div className='min-w-0'>
              <strong className='text-sm'>{vaccination.name}</strong>
              <div className='text-muted-foreground text-sm'>
                Administered: {formatDateTime(vaccination.administeredAt)}
              </div>
              {vaccination.expiresAt ? (
                <div className='text-muted-foreground text-sm'>
                  Next due: {formatDateTime(vaccination.expiresAt)}
                </div>
              ) : null}
              {vaccination.lotNumber ? (
                <div className='text-muted-foreground text-sm'>Lot: {vaccination.lotNumber}</div>
              ) : null}
            </div>
            {onEdit && (
              <Button type='button' variant='link' size='sm' onClick={() => onEdit(vaccination)}>
                Edit
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VaccinationTimeline;
