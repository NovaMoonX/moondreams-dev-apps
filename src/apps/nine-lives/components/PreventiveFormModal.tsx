import { useMemo } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import {
  PREVENTIVE_NAME_OPTIONS,
  PREVENTIVE_TYPE_OPTIONS,
} from '@apps/nine-lives/constants/presetOptions';
import {
  selectClinicsByHousehold,
  selectDoctorsByHousehold,
} from '@apps/nine-lives/store/selectors';
import type { Preventive, PreventiveType } from '@apps/nine-lives/types';

const OTHER_NAME = 'Other';

interface PreventiveNameValue {
  preset: string;
  customName: string;
}

interface PreventiveFormValues {
  nameChoice: PreventiveNameValue;
  type: string;
  administeredAt: string;
  expiresAt?: string;
  dosage?: string;
  clinicId?: string;
  doctorId?: string;
  linkedVisitId?: string;
}

interface PreventiveFormModalProps {
  isOpen: boolean;
  householdId: string;
  catName: string;
  initialPreventive?: Preventive | null;
  isSubmitting?: boolean;
  onSubmit: (
    preventive: Partial<Preventive> & Pick<Preventive, 'name' | 'type' | 'administeredAt'>,
  ) => Promise<void> | void;
  onDelete?: (preventiveId: string) => Promise<void> | void;
  onClose: () => void;
}

function PreventiveNameField({
  value,
  onValueChange,
  disabled,
}: {
  value: PreventiveNameValue;
  onValueChange: (value: PreventiveNameValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className='space-y-3'>
      <Select
        options={PREVENTIVE_NAME_OPTIONS.map((option) => ({ text: option, value: option }))}
        value={value.preset}
        onChange={(preset) => onValueChange({ ...value, preset })}
        disabled={disabled}
      />
      {value.preset === OTHER_NAME && (
        <div className='space-y-1'>
          <Label className='text-sm'>Custom product name</Label>
          <Input
            value={value.customName}
            onChange={(event) => onValueChange({ ...value, customName: event.target.value })}
            placeholder='Enter the product name'
            variant='outline'
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

function PreventiveFormModal({
  isOpen,
  householdId,
  catName,
  initialPreventive,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: PreventiveFormModalProps) {
  const { confirm } = useActionModal();
  const clinics = useAppSelector(selectClinicsByHousehold(householdId));
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId));
  const isEditing = Boolean(initialPreventive?.id);
  const formId = initialPreventive?.id ?? 'new-nine-lives-preventive';
  const savedName = initialPreventive?.name ?? '';
  const nameChoice: PreventiveNameValue = {
    preset: PREVENTIVE_NAME_OPTIONS.includes(
      savedName as (typeof PREVENTIVE_NAME_OPTIONS)[number],
    )
      ? savedName
      : OTHER_NAME,
    customName: PREVENTIVE_NAME_OPTIONS.includes(
      savedName as (typeof PREVENTIVE_NAME_OPTIONS)[number],
    )
      ? ''
      : savedName,
  };

  const clinicOptions = useMemo(
    () => [
      { label: 'None', value: '' },
      ...clinics.map((clinic) => ({ label: clinic.name, value: clinic.id })),
    ],
    [clinics],
  );
  const doctorOptions = useMemo(
    () => [
      { label: 'None', value: '' },
      ...doctors.map((doctor) => ({ label: doctor.name, value: doctor.id })),
    ],
    [doctors],
  );
  const fields = useMemo(
    () => [
      FormFactories.custom({
        name: 'nameChoice',
        label: 'Product name',
        renderComponent: (props) => (
          <PreventiveNameField
            value={props.value as PreventiveNameValue}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
          />
        ),
      }),
      FormFactories.select({
        name: 'type',
        label: 'Preventive type',
        options: PREVENTIVE_TYPE_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
        })),
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
      FormFactories.input({
        name: 'dosage',
        label: 'Dosage (optional)',
        placeholder: 'e.g. 0.5 mL',
        variant: 'outline',
      }),
      FormFactories.select({
        name: 'clinicId',
        label: 'Clinic (optional)',
        options: clinicOptions,
      }),
      FormFactories.select({
        name: 'doctorId',
        label: 'Doctor (optional)',
        options: doctorOptions,
      }),
      FormFactories.input({
        name: 'linkedVisitId',
        label: 'Linked visit ID (optional)',
        placeholder: 'visit-id',
        variant: 'outline',
      }),
    ],
    [clinicOptions, doctorOptions],
  );

  const handleSubmit = async (data: PreventiveFormValues) => {
    const name = data.nameChoice.preset === OTHER_NAME
      ? data.nameChoice.customName.trim()
      : data.nameChoice.preset.trim();
    const administeredAt = fromDateInputValue(data.administeredAt) ?? null;

    if (!name || administeredAt === null) {
      return;
    }

    await onSubmit({
      id: initialPreventive?.id,
      name,
      type: data.type as PreventiveType,
      administeredAt,
      expiresAt: data.expiresAt ? (fromDateInputValue(data.expiresAt) ?? null) : null,
      dosage: data.dosage?.trim() || null,
      clinicId: data.clinicId?.trim() || null,
      doctorId: data.doctorId?.trim() || null,
      linkedVisitId: data.linkedVisitId?.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialPreventive?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete preventive dose',
      message: `Are you sure you want to delete ${initialPreventive.name} for ${catName}?`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialPreventive.id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit preventive dose' : `Add preventive for ${catName}`}
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          nameChoice,
          type: initialPreventive?.type ?? 'flea-tick',
          administeredAt: toDateInputValue(initialPreventive?.administeredAt ?? undefined),
          expiresAt: toDateInputValue(initialPreventive?.expiresAt ?? undefined),
          dosage: initialPreventive?.dosage ?? '',
          clinicId: initialPreventive?.clinicId ?? '',
          doctorId: initialPreventive?.doctorId ?? '',
          linkedVisitId: initialPreventive?.linkedVisitId ?? '',
        }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as PreventiveFormValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            {isEditing && onDelete ? (
              <Button
                type='button'
                variant='secondary'
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              >
                Delete
              </Button>
            ) : <span />}
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save preventive' : 'Add preventive'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default PreventiveFormModal;
