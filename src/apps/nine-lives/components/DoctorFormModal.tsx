import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';

interface DoctorFormValues {
  name: string;
  notes?: string | null;
}

interface DoctorFormModalProps {
  isOpen: boolean;
  clinicName: string;
  isSubmitting?: boolean;
  onSubmit: (doctor: DoctorFormValues) => Promise<void> | void;
  onClose: () => void;
}

const { input, textarea } = FormFactories;

function DoctorFormModal({
  isOpen,
  clinicName,
  isSubmitting = false,
  onSubmit,
  onClose,
}: DoctorFormModalProps) {
  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Doctor name',
        placeholder: 'Dr. Morgan Lee',
        required: true,
        variant: 'outline',
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

  const handleSubmit = async (data: DoctorFormValues) => {
    const trimmedName = data.name.trim();

    if (!trimmedName) {
      return;
    }

    await onSubmit({
      name: trimmedName,
      notes: data.notes?.trim() || null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add doctor to ${clinicName}`}>
      <Form
        id='nine-lives-doctor-form'
        form={fields}
        initialData={{ name: '', notes: '' }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as DoctorFormValues);
        }}
        submitButton={
          <div className='flex justify-end'>
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Add doctor'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default DoctorFormModal;
