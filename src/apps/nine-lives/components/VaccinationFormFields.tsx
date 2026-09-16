import { useMemo } from 'react';

import { Button, Form, FormFactories, Input, Label, Select } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import type { VaccinationFormSubmission } from '@apps/nine-lives/store/actions/vaccinationsActions';
import {
  selectClinicsByHousehold,
  selectDoctorsByHousehold,
  selectVisitsByHousehold,
} from '@apps/nine-lives/store/selectors';
import { getVisitOptions } from '@apps/nine-lives/utils/visitOptions';

import DetailsDisclosure from './DetailsDisclosure';
import LinkedVisitsField from './LinkedVisitsField';

const NONE_OPTION_VALUE = '';

interface AdditionalDetailsValue {
  expiresAt: string;
  clinicId: string;
  doctorId: string;
  lotNumber: string;
  linkedVisitId: string;
}

interface VaccinationFormValues {
  catId?: string;
  name: string;
  administeredAt: string;
  additionalDetails: AdditionalDetailsValue;
}

function AdditionalDetailsFields({
  value,
  onValueChange,
  disabled,
  clinicOptions,
  doctorOptions,
  visitOptions,
}: {
  value: AdditionalDetailsValue;
  onValueChange: (value: AdditionalDetailsValue) => void;
  disabled?: boolean;
  clinicOptions: { label: string; value: string }[];
  doctorOptions: { label: string; value: string }[];
  visitOptions: { label: string; value: string }[];
}) {
  const update = (changes: Partial<AdditionalDetailsValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <DetailsDisclosure label='Additional details'>
      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label className='text-sm'>Next due date</Label>
          <Input
            type='date'
            value={value.expiresAt}
            onChange={(event) => update({ expiresAt: event.target.value })}
            variant='outline'
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Clinic</Label>
          <Select
            options={clinicOptions.map((option) => ({ text: option.label, value: option.value }))}
            value={value.clinicId}
            disabled={disabled}
            onChange={(clinicId) => update({ clinicId })}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Doctor</Label>
          <Select
            options={doctorOptions.map((option) => ({ text: option.label, value: option.value }))}
            value={value.doctorId}
            disabled={disabled}
            onChange={(doctorId) => update({ doctorId })}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Lot number</Label>
          <Input
            value={value.lotNumber}
            onChange={(event) => update({ lotNumber: event.target.value })}
            placeholder='L-1024'
            variant='outline'
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Linked visit</Label>
          <LinkedVisitsField
            value={value.linkedVisitId ? [value.linkedVisitId] : []}
            onValueChange={(ids) => update({ linkedVisitId: ids[0] ?? '' })}
            visitOptions={visitOptions}
            disabled={disabled}
            multiple={false}
          />
        </div>
      </div>
    </DetailsDisclosure>
  );
}

/**
 * `id` here is purely a UI signal for this form ("is a record's latest dose being edited in
 * place?") — it does not have to be the record actually being submitted to. Callers logging a
 * new dose against an existing record track that record's id themselves and omit `id` here so
 * the form renders as a fresh "Add" (no Delete button, submit reads "Add vaccination").
 */
export type VaccinationFormInitialValues = Partial<VaccinationFormSubmission>;

interface VaccinationFormFieldsProps {
  householdId?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialVaccination?: VaccinationFormInitialValues | null;
  isSubmitting?: boolean;
  onSubmit: (vaccination: VaccinationFormSubmission) => Promise<void> | void;
  onDelete?: (vaccinationId: string) => Promise<void> | void;
  /** When provided, renders a Cancel button (for inline/non-modal usage). */
  onCancel?: () => void;
}

const { input, select, custom } = FormFactories;

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
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
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

  const visitOptions = useMemo(() => getVisitOptions(visits), [visits]);

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
      custom({
        name: 'additionalDetails',
        label: '',
        renderComponent: (props) => (
          <AdditionalDetailsFields
            value={props.value as AdditionalDetailsValue}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
            clinicOptions={clinicOptions}
            doctorOptions={doctorOptions}
            visitOptions={visitOptions}
          />
        ),
        colSpan: 'full',
      }),
    ],
    [showCatField, catOptions, clinicOptions, doctorOptions, visitOptions, initialVaccination],
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
      expiresAt: data.additionalDetails.expiresAt
        ? (fromDateInputValue(data.additionalDetails.expiresAt) ?? null)
        : null,
      clinicId: data.additionalDetails.clinicId?.trim() || null,
      doctorId: data.additionalDetails.doctorId?.trim() || null,
      lotNumber: data.additionalDetails.lotNumber?.trim() || null,
      linkedVisitId: data.additionalDetails.linkedVisitId?.trim() || null,
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
        additionalDetails: {
          expiresAt: toDateInputValue(initialVaccination?.expiresAt ?? undefined),
          clinicId: initialVaccination?.clinicId ?? '',
          doctorId: initialVaccination?.doctorId ?? '',
          lotNumber: initialVaccination?.lotNumber ?? '',
          linkedVisitId: initialVaccination?.linkedVisitId ?? '',
        },
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
