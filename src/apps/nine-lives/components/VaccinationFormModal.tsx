import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppSelector } from '@/store';
import { selectClinicsByHousehold, selectDoctorsByHousehold } from '@apps/nine-lives/store/selectors';
import type { Vaccination } from '@apps/nine-lives/types';

const NONE_OPTION_VALUE = '';

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
  householdId?: string;
  catName?: string;
  initialVaccination?: Partial<Vaccination> | null;
  isSubmitting?: boolean;
  onSubmit: (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => Promise<void> | void;
  onDelete?: (vaccinationId: string) => Promise<void> | void;
  onClose: () => void;
}

const { input, select } = FormFactories;

function VaccinationFormModal({
  isOpen,
  householdId,
  catName,
  initialVaccination,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: VaccinationFormModalProps) {
  const { confirm } = useActionModal();
  const clinics = useAppSelector(selectClinicsByHousehold(householdId));
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId));
  const isEditing = Boolean(initialVaccination?.id);
  const formId = initialVaccination?.id ?? 'new-nine-lives-vaccination';

  const clinicOptions = useMemo(
    () => [
      { label: 'None', value: NONE_OPTION_VALUE },
      ...clinics.map((clinic) => ({ label: clinic.name, value: clinic.id })),
    ],
    [clinics],
  );

  const doctorOptions = useMemo(
    () => [
      { label: 'None', value: NONE_OPTION_VALUE },
      ...doctors.map((doctor) => ({ label: doctor.name, value: doctor.id })),
    ],
    [doctors],
  );

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
      select({
        name: 'clinicId',
        label: 'Clinic (optional)',
        options: clinicOptions,
      }),
      select({
        name: 'doctorId',
        label: 'Doctor (optional)',
        options: doctorOptions,
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
    [clinicOptions, doctorOptions],
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
