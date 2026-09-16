import { useMemo } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import { selectClinicsByHousehold, selectDoctorsByHousehold } from '@apps/nine-lives/store/selectors';
import type { Vaccination } from '@apps/nine-lives/types';

const NONE_OPTION_VALUE = '';

interface VaccinationFormValues {
  catId?: string;
  name: string;
  administeredAt: string;
  expiresAt?: string | null;
  clinicId?: string | null;
  doctorId?: string | null;
  lotNumber?: string | null;
  linkedVisitId?: string | null;
}

interface VaccinationFormFieldsProps {
  householdId?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialVaccination?: Partial<Vaccination> | null;
  isSubmitting?: boolean;
  onSubmit: (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => Promise<void> | void;
  onDelete?: (vaccinationId: string) => Promise<void> | void;
  /** When provided, renders a Cancel button (for inline/non-modal usage). */
  onCancel?: () => void;
}

const { input, select } = FormFactories;

function VaccinationFormFields({
  householdId,
  catOptions,
  initialVaccination,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onCancel,
}: VaccinationFormFieldsProps) {
  const { confirm } = useActionModal();
  const clinics = useAppSelector(selectClinicsByHousehold(householdId), shallowEqual);
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId), shallowEqual);
  const isEditing = Boolean(initialVaccination?.id);
  const formId = initialVaccination?.id ?? 'new-nine-lives-vaccination';
  const showCatField = Boolean(catOptions && catOptions.length > 0);

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
      ...(showCatField
        ? [
            select({
              name: 'catId',
              label: 'Cat',
              options: catOptions ?? [],
            }),
          ]
        : []),
      input({
        name: 'name',
        label: 'Vaccine name',
        placeholder: initialVaccination?.name || 'Rabies',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'administeredAt',
        label: 'Administered date',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'expiresAt',
        label: 'Next due date (optional)',
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
        placeholder: initialVaccination?.lotNumber || 'L-1024',
        variant: 'outline',
      }),
      // TODO: replace with a select populated from this cat's visits once visit records exist.
      input({
        name: 'linkedVisitId',
        label: 'Linked visit ID (optional)',
        placeholder: initialVaccination?.linkedVisitId || 'visit-id',
        variant: 'outline',
      }),
    ],
    [showCatField, catOptions, clinicOptions, doctorOptions, initialVaccination],
  );

  const handleSubmit = async (data: VaccinationFormValues) => {
    const trimmedName = data.name.trim();
    const administeredAt = fromDateInputValue(data.administeredAt) ?? null;

    if (!trimmedName || administeredAt === null || (showCatField && !data.catId)) {
      return;
    }

    await onSubmit({
      id: initialVaccination?.id,
      catId: data.catId || initialVaccination?.catId,
      name: trimmedName,
      administeredAt,
      expiresAt: data.expiresAt ? (fromDateInputValue(data.expiresAt) ?? null) : null,
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

  return (
    <Form
      key={formId}
      id={formId}
      form={fields}
      initialData={{
        catId: initialVaccination?.catId ?? '',
        name: initialVaccination?.name ?? '',
        administeredAt: toDateInputValue(initialVaccination?.administeredAt ?? undefined),
        expiresAt: toDateInputValue(initialVaccination?.expiresAt ?? undefined),
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
          <div className='flex items-center gap-2'>
            {onCancel && (
              <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save vaccination' : 'Add vaccination'}
            </Button>
          </div>
        </div>
      }
    />
  );
}

export default VaccinationFormFields;
