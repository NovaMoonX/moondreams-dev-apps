import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo, useState } from 'react';

import type { VetClinic } from '@apps/nine-lives/types';

import ModalFooterActions from './ModalFooterActions';

interface VetClinicFormValues {
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  isEmergency24Hour: boolean;
  notes?: string | null;
}

interface VetClinicFormModalProps {
  isOpen: boolean;
  initialClinic?: Partial<VetClinic> | null;
  isSubmitting?: boolean;
  onSubmit: (clinic: VetClinicFormValues) => Promise<void> | void;
  onDelete?: (clinicId: string) => Promise<void> | void;
  onClose?: () => void;
}

const { checkbox, input, textarea } = FormFactories;

function VetClinicFormModal({
  isOpen,
  initialClinic,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: VetClinicFormModalProps) {
  const { confirm } = useActionModal();
  const formId = initialClinic?.id ?? 'new-vet-clinic';
  const isEditing = Boolean(initialClinic?.id);
  const [isValid, setIsValid] = useState(Boolean(initialClinic?.name?.trim()));

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
        name: 'email',
        label: 'Email address',
        placeholder: 'Email address',
        type: 'email',
        variant: 'outline',
      }),
      input({
        name: 'website',
        label: 'Website',
        placeholder: 'https://...',
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
      email: initialClinic?.email ?? '',
      website: initialClinic?.website ?? '',
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
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      website: data.website?.trim() || null,
      address: data.address?.trim() || null,
      isEmergency24Hour: data.isEmergency24Hour,
      notes: data.notes?.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialClinic?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete clinic',
      message: `Are you sure you want to delete ${initialClinic.name ?? 'this clinic'}? This action cannot be undone.`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialClinic.id);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose ?? (() => undefined)} title='Clinic'>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          setIsValid(Boolean((data as VetClinicFormValues).name.trim()));
        }}
        onSubmit={(data) => {
          void handleSubmit(data as VetClinicFormValues);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={
              isEditing &&
              onDelete && (
                <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                  Delete clinic
                </Button>
              )
            }
            rightActions={
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save clinic' : 'Add clinic'}
              </Button>
            }
          />
        }
      />
    </Modal>
  );
}

export default VetClinicFormModal;
