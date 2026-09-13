import { formatDateTime } from '@/utils/formatUtils';
import type { Vaccination } from '@apps/nine-lives/types';

interface VaccinationTimelineProps {
  vaccinations: Vaccination[];
  title?: string;
  emptyLabel?: string;
}

function VaccinationTimeline({
  vaccinations,
  title = 'Vaccinations',
  emptyLabel = 'No vaccinations logged yet.',
}: VaccinationTimelineProps) {
  const sortedVaccinations = [...vaccinations].sort(
    (left, right) => right.administeredAt - left.administeredAt,
  );

  if (sortedVaccinations.length === 0) {
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
        {sortedVaccinations.map((vaccination) => (
          <div key={vaccination.id}>
            <div>
              <strong>{vaccination.name}</strong>
            </div>
            <div>Administered: {formatDateTime(vaccination.administeredAt)}</div>
            {vaccination.expiresAt ? (
              <div>Next due: {formatDateTime(vaccination.expiresAt)}</div>
            ) : null}
            {vaccination.lotNumber ? <div>Lot: {vaccination.lotNumber}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VaccinationTimeline;
