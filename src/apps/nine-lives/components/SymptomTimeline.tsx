import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';
import type { Symptom } from '@apps/nine-lives/types';

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
  title?: string;
  emptyLabel?: string;
  onEdit?: (symptom: Symptom) => void;
  onDelete?: (symptom: Symptom) => void;
}

function SymptomTimeline({
  symptoms,
  title = 'Symptoms',
  emptyLabel = 'No symptoms logged yet.',
  onEdit,
  onDelete,
}: SymptomTimelineProps) {
  const sortedSymptoms = [...symptoms].sort(
    (left, right) => right.firstNoticedAt - left.firstNoticedAt,
  );

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
      <h3 className='text-sm font-medium'>{title}</h3>
      <div className='divide-border divide-y'>
        {sortedSymptoms.map((symptom) => (
          <div key={symptom.id} className='flex items-start justify-between gap-3 py-2 first:pt-0'>
            <div className='min-w-0'>
              <div className='flex flex-wrap gap-1 pb-1'>
                {symptom.quickTags.length > 0 ? (
                  symptom.quickTags.map((tag) => (
                    <span
                      key={`${symptom.id}-${tag}`}
                      className='rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground'
                    >
                      {symptomTagLabels[tag] ?? tag}
                    </span>
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
                <div className='text-muted-foreground text-sm'>Linked condition</div>
              ) : null}
            </div>

            <div className='flex shrink-0 items-center gap-2'>
              {onEdit && (
                <Button type='button' variant='link' size='sm' onClick={() => onEdit(symptom)}>
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button type='button' variant='link' size='sm' onClick={() => onDelete(symptom)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SymptomTimeline;
