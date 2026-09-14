import { useMemo, useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import type {
  CatCondition,
  ConditionCategory,
  LibraryCondition,
} from '@apps/nine-lives/types';

interface CatConditionFormModalProps {
  libraryConditions: LibraryCondition[];
  catName?: string;
  initialValue?: Partial<CatCondition>;
  onSubmit?: (condition: Partial<CatCondition>) => void;
  onClose?: () => void;
}

const CONDITION_CATEGORIES: ConditionCategory[] = [
  'illness',
  'injury',
  'chronic',
  'parasite',
  'allergy',
  'other',
];

export function CatConditionFormModal({
  libraryConditions,
  catName,
  initialValue,
  onSubmit,
  onClose,
}: CatConditionFormModalProps) {
  const [isCustom, setIsCustom] = useState(Boolean(initialValue && !initialValue.libraryConditionId));
  const [selectedLibraryId, setSelectedLibraryId] = useState(
    initialValue?.libraryConditionId ?? libraryConditions[0]?.id ?? '',
  );
  const [name, setName] = useState(initialValue?.name ?? '');
  const [category, setCategory] = useState<ConditionCategory>(
    initialValue?.category ?? 'illness',
  );
  const [description, setDescription] = useState(initialValue?.description ?? '');
  const [status, setStatus] = useState(initialValue?.status ?? 'active');

  const selectedLibraryCondition = useMemo(
    () => libraryConditions.find((condition) => condition.id === selectedLibraryId) ?? null,
    [libraryConditions, selectedLibraryId],
  );

  const handleSubmit = () => {
    const libraryName = selectedLibraryCondition?.name ?? '';
    const libraryCategory = selectedLibraryCondition?.category ?? category;
    const libraryDescription = selectedLibraryCondition?.description ?? '';
    const nextDescription = isCustom ? description.trim() || null : libraryDescription || description.trim() || null;

    const nextCondition: Partial<CatCondition> = {
      source: isCustom ? 'custom' : 'library',
      libraryConditionId: isCustom ? null : selectedLibraryCondition?.id ?? null,
      name: isCustom ? name.trim() : libraryName || name.trim(),
      category: isCustom ? category : libraryCategory,
      description: nextDescription,
      status,
      linkedVisitIds: initialValue?.linkedVisitIds ?? [],
      occurredAt: initialValue?.occurredAt ?? Date.now(),
    };

    onSubmit?.(nextCondition);
  };

  return (
    <div className={join('space-y-4 rounded-lg border border-border bg-card p-4')}>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-foreground">
          {catName ? `${catName} condition` : 'Cat condition'}
        </h3>
        {onClose ? (
          <button type="button" className="text-sm text-muted-foreground" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={join(
            'rounded-md px-3 py-2 text-sm',
            !isCustom ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          )}
          onClick={() => setIsCustom(false)}
        >
          From library
        </button>
        <button
          type="button"
          className={join(
            'rounded-md px-3 py-2 text-sm',
            isCustom ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          )}
          onClick={() => setIsCustom(true)}
        >
          Custom
        </button>
      </div>

      {!isCustom ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">Library entry</label>
          <select
            value={selectedLibraryId}
            onChange={(event) => setSelectedLibraryId(event.target.value)}
            className={join('w-full rounded-md border border-border bg-background px-3 py-2')}
          >
            {libraryConditions.map((condition) => (
              <option key={condition.id} value={condition.id}>
                {condition.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={join('w-full rounded-md border border-border bg-background px-3 py-2')}
              placeholder="e.g. Ear infection"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Category</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ConditionCategory)}
              className={join('w-full rounded-md border border-border bg-background px-3 py-2')}
            >
              {CONDITION_CATEGORIES.map((conditionCategory) => (
                <option key={conditionCategory} value={conditionCategory}>
                  {conditionCategory}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={join('w-full rounded-md border border-border bg-background px-3 py-2')}
          rows={4}
          placeholder="Add notes or symptoms"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Status</label>
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as CatCondition['status'])
          }
          className={join('w-full rounded-md border border-border bg-background px-3 py-2')}
        >
          <option value="active">Active</option>
          <option value="ongoing">Ongoing</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        {onClose ? (
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={handleSubmit}>
          Save condition
        </button>
      </div>
    </div>
  );
}

export default CatConditionFormModal;
