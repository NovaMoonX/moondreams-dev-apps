import { Modal } from '@moondreamsdev/dreamer-ui/components';

import type { VaccinationFormSubmission } from '@apps/nine-lives/store/actions/vaccinationsActions';

import VaccinationFormFields, { type VaccinationFormInitialValues } from './VaccinationFormFields';

export type { VaccinationFormInitialValues };

interface VaccinationFormModalProps {
  isOpen: boolean;
  householdId?: string;
  catName?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialVaccination?: VaccinationFormInitialValues | null;
  /** Title override — used for "Mark administered today", which prefills like an edit but isn't one. */
  title?: string;
  isSubmitting?: boolean;
  onSubmit: (vaccination: VaccinationFormSubmission) => Promise<void> | void;
  onDelete?: (vaccinationId: string) => Promise<void> | void;
  onClose: () => void;
}

function VaccinationFormModal({
  isOpen,
  householdId,
  catName,
  catOptions,
  initialVaccination,
  title,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: VaccinationFormModalProps) {
  const isEditing = Boolean(initialVaccination?.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? (isEditing ? `Edit vaccination` : `Add vaccination${catName ? ` for ${catName}` : ''}`)}
    >
      <VaccinationFormFields
        householdId={householdId}
        catOptions={catOptions}
        initialVaccination={initialVaccination}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onDelete={onDelete}
      />
    </Modal>
  );
}

export default VaccinationFormModal;
