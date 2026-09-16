import { Modal } from '@moondreamsdev/dreamer-ui/components';

import type { CatCondition, LibraryCondition } from '../types';
import CatConditionFormFields from './CatConditionFormFields';

interface CatConditionFormModalProps {
  isOpen: boolean;
  householdId?: string;
  libraryConditions: LibraryCondition[];
  /** When provided, renders a required "Cat" selector so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialCondition?: Partial<CatCondition> | null;
  isSubmitting?: boolean;
  onSubmit: (
    condition: Partial<CatCondition> & Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>,
  ) => Promise<void> | void;
  onDelete?: (conditionId: string) => Promise<void> | void;
  onClose: () => void;
}

function CatConditionFormModal({
  isOpen,
  householdId,
  libraryConditions,
  catOptions,
  initialCondition,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: CatConditionFormModalProps) {
  const isEditing = Boolean(initialCondition?.id);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit condition' : 'Add condition'}>
      <CatConditionFormFields
        householdId={householdId}
        libraryConditions={libraryConditions}
        catOptions={catOptions}
        initialCondition={initialCondition}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onDelete={onDelete}
      />
    </Modal>
  );
}

export default CatConditionFormModal;
