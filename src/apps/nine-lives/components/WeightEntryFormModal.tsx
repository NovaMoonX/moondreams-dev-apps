import { Modal } from '@moondreamsdev/dreamer-ui/components';

import type { WeightEntry } from '@apps/nine-lives/types';

import WeightEntryFormFields from './WeightEntryFormFields';

interface WeightEntryFormModalProps {
  isOpen: boolean;
  householdId?: string;
  catName?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialWeightEntry?: Partial<WeightEntry> | null;
  isSubmitting?: boolean;
  onSubmit: (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => Promise<void> | void;
  onDelete?: (weightEntryId: string) => Promise<void> | void;
  onClose: () => void;
}

function WeightEntryFormModal({
  isOpen,
  householdId,
  catName,
  catOptions,
  initialWeightEntry,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: WeightEntryFormModalProps) {
  const isEditing = Boolean(initialWeightEntry?.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit weight entry' : `Add weight entry${catName ? ` for ${catName}` : ''}`}
    >
      <WeightEntryFormFields
        householdId={householdId}
        catName={catName}
        catOptions={catOptions}
        initialWeightEntry={initialWeightEntry}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onDelete={onDelete}
      />
    </Modal>
  );
}

export default WeightEntryFormModal;
