import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo } from 'react';

import type { VetClinic } from '@apps/nine-lives/types';

interface VetClinicFormValues {
  name: string;
  phone?: string | null;
  email?: string | null;
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
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              {isEditing && onDelete && (
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                >
                  Delete clinic
                </Button>
              )}
            </div>
            <div className='flex justify-end'>
              <Button type='submit' loading={isSubmitting}>
                {isSubmitting ? 'Saving…' : initialClinic?.id ? 'Save clinic' : 'Add clinic'}
              </Button>
            </div>
          </div>
        }
      />
    </Modal>
  );
}

export default VetClinicFormModal;
