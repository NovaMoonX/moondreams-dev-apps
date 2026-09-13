import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import type { Vaccination } from '@apps/nine-lives/types';

interface VaccinationFormValues {
  name: string;
  administeredAt: string;
  expiresAt?: string | null;
  clinicId?: string | null;
  doctorId?: string | null;
  lotNumber?: string | null;
  linkedVisitId?: string | null;
}

interface VaccinationFormModalProps {
  isOpen: boolean;
  catName?: string;
  initialVaccination?: Partial<Vaccination> | null;
  isSubmitting?: boolean;
  onSubmit: (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => Promise<void> | void;
  onDelete?: (vaccinationId: string) => Promise<void> | void;
  onClose: () => void;
}

const { input } = FormFactories;

function VaccinationFormModal({
  isOpen,
  catName,
  initialVaccination,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: VaccinationFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialVaccination?.id);
  const formId = initialVaccination?.id ?? 'new-nine-lives-vaccination';

  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Vaccine name',
        placeholder: 'Rabies',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'administeredAt',
        label: 'Administered date',
        placeholder: '2025-03-10',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'expiresAt',
        label: 'Next due date (optional)',
        placeholder: '2026-03-10',
        variant: 'outline',
      }),
      input({
        name: 'clinicId',
        label: 'Clinic ID (optional)',
        placeholder: 'Clinic reference',
        variant: 'outline',
      }),
      input({
        name: 'doctorId',
        label: 'Doctor ID (optional)',
        placeholder: 'Doctor reference',
        variant: 'outline',
      }),
      input({
        name: 'lotNumber',
        label: 'Lot number (optional)',
        placeholder: 'L-1024',
        variant: 'outline',
      }),
      input({
        name: 'linkedVisitId',
        label: 'Linked visit ID (optional)',
        placeholder: 'visit-id',
        variant: 'outline',
      }),
    ],
    [],
  );

  const toTimestamp = (value: string | null | undefined) => {
    if (!value) {
      return null;
    }

    const parsed = new Date(`${value}T12:00:00`).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleSubmit = async (data: VaccinationFormValues) => {
    const trimmedName = data.name.trim();
    const administeredAt = toTimestamp(data.administeredAt);

    if (!trimmedName || administeredAt === null) {
      return;
    }

    await onSubmit({
      id: initialVaccination?.id,
      name: trimmedName,
      administeredAt,
      expiresAt: toTimestamp(data.expiresAt ?? null),
      clinicId: data.clinicId?.trim() || null,
      doctorId: data.doctorId?.trim() || null,
      lotNumber: data.lotNumber?.trim() || null,
      linkedVisitId: data.linkedVisitId?.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialVaccination?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete vaccination',
      message: `Are you sure you want to delete ${initialVaccination.name ?? 'this vaccination'}?`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialVaccination.id);
    }
  };

  const defaultDate = (value: number | null | undefined) => {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit vaccination` : `Add vaccination${catName ? ` for ${catName}` : ''}`}
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          name: initialVaccination?.name ?? '',
          administeredAt: defaultDate(initialVaccination?.administeredAt ?? null),
          expiresAt: defaultDate(initialVaccination?.expiresAt ?? null),
          clinicId: initialVaccination?.clinicId ?? '',
          doctorId: initialVaccination?.doctorId ?? '',
          lotNumber: initialVaccination?.lotNumber ?? '',
          linkedVisitId: initialVaccination?.linkedVisitId ?? '',
        }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as VaccinationFormValues);
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
                  Delete
                </Button>
              )}
            </div>
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save vaccination' : 'Add vaccination'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default VaccinationFormModal;
