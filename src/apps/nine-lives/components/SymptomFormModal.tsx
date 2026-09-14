import { useEffect, useMemo, useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { Symptom, SymptomQuickTag, SymptomSeverity } from '@apps/nine-lives/types';

const symptomTagOptions: Array<{ value: SymptomQuickTag; label: string }> = [
  { value: 'litter_box_change', label: 'Litter box change' },
  { value: 'appetite_change', label: 'Appetite change' },
  { value: 'hiding', label: 'Hiding' },
  { value: 'playfulness_change', label: 'Playfulness change' },
  { value: 'grooming_change', label: 'Grooming change' },
  { value: 'vomiting', label: 'Vomiting' },
  { value: 'lethargy', label: 'Lethargy' },
  { value: 'other', label: 'Other' },
];

const severityOptions: Array<{ value: SymptomSeverity; label: string }> = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

interface SymptomFormModalProps {
  isOpen: boolean;
  catName?: string;
  catOptions?: { label: string; value: string }[];
  conditionOptions?: { label: string; value: string }[];
  initialSymptom?: Partial<Symptom> | null;
  isSubmitting?: boolean;
  onSubmit: (
    symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>,
  ) => Promise<void> | void;
  onDelete?: (symptomId: string) => Promise<void> | void;
  onClose: () => void;
}

function SymptomFormModal({
  isOpen,
  catName,
  catOptions,
  conditionOptions,
  initialSymptom,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: SymptomFormModalProps) {
  const isEditing = Boolean(initialSymptom?.id);
  const [description, setDescription] = useState(initialSymptom?.description ?? '');
  const [quickTags, setQuickTags] = useState<SymptomQuickTag[]>(initialSymptom?.quickTags ?? []);
  const [severity, setSeverity] = useState<SymptomSeverity | ''>(initialSymptom?.severity ?? '');
  const [firstNoticedAt, setFirstNoticedAt] = useState<number>(
    initialSymptom?.firstNoticedAt ?? Date.now(),
  );
  const [linkedConditionId, setLinkedConditionId] = useState<string>(
    initialSymptom?.linkedConditionId ?? '',
  );

  useEffect(() => {
    setDescription(initialSymptom?.description ?? '');
    setQuickTags(initialSymptom?.quickTags ?? []);
    setSeverity(initialSymptom?.severity ?? '');
    setFirstNoticedAt(initialSymptom?.firstNoticedAt ?? Date.now());
    setLinkedConditionId(initialSymptom?.linkedConditionId ?? '');
  }, [initialSymptom]);

  const hasSelectableConditions = useMemo(
    () => (conditionOptions?.length ?? 0) > 0,
    [conditionOptions],
  );

  const handleTagToggle = (tag: SymptomQuickTag) => {
    setQuickTags((current) =>
      current.includes(tag)
        ? current.filter((existingTag) => existingTag !== tag)
        : [...current, tag],
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await onSubmit({
      ...initialSymptom,
      description,
      quickTags,
      firstNoticedAt,
      severity: severity || null,
      linkedConditionId: linkedConditionId || null,
    });
  };

  const handleDelete = async () => {
    if (!initialSymptom?.id || !onDelete) {
      return;
    }

    const shouldDelete = window.confirm('Delete this symptom entry?');
    if (!shouldDelete) {
      return;
    }

    await onDelete(initialSymptom.id);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit symptom' : `Add symptom${catName ? ` for ${catName}` : ''}`}
    >
      <form onSubmit={handleSubmit} className='space-y-4'>
        {catOptions && catOptions.length > 0 ? (
          <label className='block text-sm font-medium'>
            Cat
            <select className='mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm'>
              {catOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className='space-y-2'>
          <div className='text-sm font-medium'>Quick tags</div>
          <div className='flex flex-wrap gap-2'>
            {symptomTagOptions.map((tagOption) => {
              const isSelected = quickTags.includes(tagOption.value);

              return (
                <button
                  key={tagOption.value}
                  type='button'
                  className={join(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  )}
                  onClick={() => handleTagToggle(tagOption.value)}
                >
                  {tagOption.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className='block text-sm font-medium'>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder='Describe what changed, when you noticed it, or anything else the vet should know.'
            className='mt-1 block min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
          />
        </label>

        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='block text-sm font-medium'>
            First noticed
            <input
              type='datetime-local'
              value={new Date(firstNoticedAt).toISOString().slice(0, 16)}
              onChange={(event) => setFirstNoticedAt(new Date(event.target.value).getTime())}
              className='mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
            />
          </label>

          <label className='block text-sm font-medium'>
            Severity
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as SymptomSeverity | '')}
              className='mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
            >
              <option value=''>Not specified</option>
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {hasSelectableConditions && (
          <label className='block text-sm font-medium'>
            Linked condition
            <select
              value={linkedConditionId}
              onChange={(event) => setLinkedConditionId(event.target.value)}
              className='mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
            >
              <option value=''>None</option>
              {conditionOptions?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className='flex items-center justify-between gap-3 pt-2'>
          {isEditing && onDelete ? (
            <Button type='button' variant='secondary' onClick={handleDelete} disabled={isSubmitting}>
              Delete
            </Button>
          ) : (
            <span />
          )}

          <div className='flex items-center gap-2'>
            <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Save changes' : 'Add symptom'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default SymptomFormModal;
