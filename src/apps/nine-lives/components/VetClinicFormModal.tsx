import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useMemo } from 'react';

import type { VetClinic } from '@apps/nine-lives/types';

interface VetClinicFormValues {
  name: string;
  phone?: string;
  address?: string;
  isEmergency24Hour: boolean;
  notes?: string;
}

interface VetClinicFormModalProps {
  isOpen: boolean;
  initialClinic?: Partial<VetClinic> | null;
  isSubmitting?: boolean;
  onSubmit: (clinic: VetClinicFormValues) => Promise<void> | void;
  onClose?: () => void;
}

const { checkbox, input, textarea } = FormFactories;

function VetClinicFormModal({
  isOpen,
  initialClinic,
  isSubmitting = false,
  onSubmit,
  onClose,
}: VetClinicFormModalProps) {
  const formId = initialClinic?.id ?? 'new-vet-clinic';

  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Clinic name',
        placeholder: 'Clinic name',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'phone',
        label: 'Phone number',
        placeholder: 'Phone number',
        variant: 'outline',
      }),
      input({
        name: 'address',
        label: 'Address',
        placeholder: 'Address',
        variant: 'outline',
      }),
      checkbox({
        name: 'isEmergency24Hour',
        label: '24-hour emergency clinic',
        text: 'Available for urgent overnight care.',
      }),
      textarea({
        name: 'notes',
        label: 'Notes',
        placeholder: 'Notes (optional)',
        rows: 3,
        variant: 'outline',
      }),
    ],
    [],
  );

  const initialData = useMemo(
    () => ({
      name: initialClinic?.name ?? '',
      phone: initialClinic?.phone ?? '',
      address: initialClinic?.address ?? '',
      isEmergency24Hour: Boolean(initialClinic?.isEmergency24Hour),
      notes: initialClinic?.notes ?? '',
    }),
    [initialClinic],
  );

  const handleSubmit = async (data: VetClinicFormValues) => {
    const trimmedName = data.name.trim();

    if (!trimmedName) {
      return;
    }

    await onSubmit({
      name: trimmedName,
      phone: data.phone?.trim() || undefined,
      address: data.address?.trim() || undefined,
      isEmergency24Hour: data.isEmergency24Hour,
      notes: data.notes?.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title={initialClinic?.id ? 'Edit clinic' : 'Add clinic'}
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as VetClinicFormValues);
        }}
        submitButton={
          <div className='flex justify-end'>
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : initialClinic?.id ? 'Save clinic' : 'Add clinic'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default VetClinicFormModal;
