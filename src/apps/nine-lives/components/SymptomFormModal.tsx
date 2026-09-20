import { Modal } from '@moondreamsdev/dreamer-ui/components';

import type { CatCondition, Symptom } from '../types';
import SymptomFormFields from './SymptomFormFields';

interface SymptomFormModalProps {
  isOpen: boolean;
  householdId?: string;
  catName?: string;
  conditions?: CatCondition[];
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialSymptom?: Partial<Symptom> | null;
  isSubmitting?: boolean;
  onSubmit: (symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>) => Promise<void> | void;
  onDelete?: (symptomId: string) => Promise<void> | void;
  onClose: () => void;
}

function SymptomFormModal({
  isOpen,
  householdId,
  catName,
  conditions = [],
  catOptions,
  initialSymptom,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: SymptomFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Symptom${catName ? ` for ${catName}` : ''}`}>
      <SymptomFormFields
        householdId={householdId}
        conditions={conditions}
        catOptions={catOptions}
        initialSymptom={initialSymptom}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onDelete={onDelete}
      />
    </Modal>
  );
}

export default SymptomFormModal;
