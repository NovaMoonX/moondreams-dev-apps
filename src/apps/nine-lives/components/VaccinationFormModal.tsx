import { Modal } from '@moondreamsdev/dreamer-ui/components';

import type { Vaccination } from '@apps/nine-lives/types';

import VaccinationFormFields from './VaccinationFormFields';

interface VaccinationFormModalProps {
  isOpen: boolean;
  householdId?: string;
  catName?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialVaccination?: Partial<Vaccination> | null;
  isSubmitting?: boolean;
  onSubmit: (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => Promise<void> | void;
  onDelete?: (vaccinationId: string) => Promise<void> | void;
  onClose: () => void;
}

function VaccinationFormModal({
  isOpen,
  householdId,
  catName,
  catOptions,
  initialVaccination,
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
      title={isEditing ? `Edit vaccination` : `Add vaccination${catName ? ` for ${catName}` : ''}`}
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
