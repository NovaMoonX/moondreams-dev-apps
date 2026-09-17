import { useMemo, useState } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import type { Doctor } from '@apps/nine-lives/types';

import ModalFooterActions from './ModalFooterActions';

interface DoctorFormValues {
  name: string;
  notes?: string | null;
}

interface DoctorFormModalProps {
  isOpen: boolean;
  clinicName: string;
  initialDoctor?: Partial<Doctor> | null;
  isSubmitting?: boolean;
  onSubmit: (doctor: DoctorFormValues) => Promise<void> | void;
  onDelete?: (doctorId: string) => Promise<void> | void;
  onClose: () => void;
}

const { input, textarea } = FormFactories;

function DoctorFormModal({
  isOpen,
  clinicName,
  initialDoctor,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: DoctorFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialDoctor?.id);
  const formId = initialDoctor?.id ?? 'new-nine-lives-doctor';
  const [isValid, setIsValid] = useState(Boolean(initialDoctor?.name?.trim()));

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

  const handleDelete = async () => {
    if (!initialDoctor?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete doctor',
      message: `Are you sure you want to delete ${initialDoctor.name ?? 'this doctor'}? This action cannot be undone.`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialDoctor.id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Doctor at ${clinicName}`}
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{ name: initialDoctor?.name ?? '', notes: initialDoctor?.notes ?? '' }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          setIsValid(Boolean((data as DoctorFormValues).name.trim()));
        }}
        onSubmit={(data) => {
          void handleSubmit(data as DoctorFormValues);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={
              isEditing &&
              onDelete && (
                <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                  Delete doctor
                </Button>
              )
            }
            rightActions={
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save doctor' : 'Add doctor'}
              </Button>
            }
          />
        }
      />
    </Modal>
  );
}

export default DoctorFormModal;
