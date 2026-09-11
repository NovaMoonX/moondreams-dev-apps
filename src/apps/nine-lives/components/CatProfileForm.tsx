import { useMemo } from 'react';

import { formatDateInputValue, parseDateInputValue } from '@/utils';
import {
  Button,
  Form,
  FormFactories,
  Input,
  type FormCustomFieldProps,
} from '@moondreamsdev/dreamer-ui/components';

import {
  CAT_BREEDS,
  INSURANCE_PROVIDER_OPTIONS,
} from '@apps/nine-lives/constants/presetOptions';
import type { Cat, CatInsurance, CatKeyDate, CatLifestyle } from '@apps/nine-lives/types';

interface CatProfileFormProps {
  householdId?: string;
  cat?: Cat | null;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onCancel?: () => void;
}

interface CatProfileFormData {
  name: string;
  breed: string;
  dateOfBirth: string;
  isDateOfBirthEstimated: boolean;
  lifestyle: CatLifestyle;
  microchipNumber: string;
  shelterName: string;
  shelterAddress: string;
  adoptedAt: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  customKeyDates: CatKeyDate[];
  notes: string;
}

const defaultLifestyle: CatLifestyle = 'indoor';
const { checkbox, custom, input, select, textarea } = FormFactories;

const breedOptions = CAT_BREEDS.map((option) => ({
  label: option,
  value: option,
}));

const insuranceProviderOptions = INSURANCE_PROVIDER_OPTIONS.map((option) => ({
  label: option,
  value: option,
}));

const lifestyleOptions = [
  {
    label: 'Indoor',
    value: 'indoor',
  },
  {
    label: 'Outdoor',
    value: 'outdoor',
  },
  {
    label: 'Indoor + outdoor',
    value: 'indoor_outdoor',
  },
];

function DateField({
  value,
  onValueChange,
  disabled,
  error,
}: FormCustomFieldProps<unknown>) {
  const inputValue = typeof value === 'string' ? value : '';

  return (
    <Input
      type='date'
      value={inputValue}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
      errorMessage={error}
      variant='outline'
    />
  );
}

function KeyDatesField({
  value,
  onValueChange,
  disabled,
}: FormCustomFieldProps<unknown>) {
  const currentValue = Array.isArray(value) ? (value as CatKeyDate[]) : undefined;
  const keyDates =
    currentValue && currentValue.length > 0 ? currentValue : [{ label: '', date: 0 }];

  const updateKeyDate = (index: number, nextValue: Partial<CatKeyDate>) => {
    const nextKeyDates = keyDates.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, ...nextValue } : entry,
    );

    onValueChange(nextKeyDates);
  };

  const addKeyDate = () => {
    const nextKeyDates = [...keyDates, { label: '', date: 0 }];
    onValueChange(nextKeyDates);
  };

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-sm text-muted-foreground'>Add memorable dates for this cat.</p>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={addKeyDate}
          disabled={disabled}
        >
          Add date
        </Button>
      </div>

      {keyDates.map((entry, index) => {
        const key = `${entry.label}-${index}`;
        const dateValue = formatDateInputValue(entry.date);

        return (
          <div key={key} className='grid gap-3 md:grid-cols-2'>
            <Input
              value={entry.label}
              onChange={(event) =>
                updateKeyDate(index, { label: event.target.value })
              }
              variant='outline'
              placeholder='e.g. Spayed/neutered'
              disabled={disabled}
            />
            <Input
              type='date'
              value={dateValue}
              onChange={(event) =>
                updateKeyDate(index, {
                  date: parseDateInputValue(event.target.value) ?? 0,
                })
              }
              variant='outline'
              disabled={disabled}
            />
          </div>
        );
      })}
    </div>
  );
}

function buildCatInsurance(provider: string, policyNumber: string): CatInsurance | undefined {
  if (!provider && !policyNumber) {
    return undefined;
  }

  return {
    provider: provider || 'Other',
    policyNumber: policyNumber || 'Unspecified',
  };
}

function buildInitialData(cat?: Cat | null): CatProfileFormData {
  const result: CatProfileFormData = {
    name: cat?.name ?? '',
    breed: cat?.breed ?? CAT_BREEDS[0],
    dateOfBirth: formatDateInputValue(cat?.dateOfBirth),
    isDateOfBirthEstimated: cat?.isDateOfBirthEstimated ?? false,
    lifestyle: cat?.lifestyle ?? defaultLifestyle,
    microchipNumber: cat?.microchipNumber ?? '',
    shelterName: cat?.shelterOrigin?.name ?? '',
    shelterAddress: cat?.shelterOrigin?.address ?? '',
    adoptedAt: formatDateInputValue(cat?.adoptedAt),
    insuranceProvider: cat?.insurance?.provider ?? INSURANCE_PROVIDER_OPTIONS[0],
    insurancePolicyNumber: cat?.insurance?.policyNumber ?? '',
    customKeyDates: cat?.customKeyDates ?? [{ label: '', date: 0 }],
    notes: cat?.notes ?? '',
  };

  return result;
}

function buildPreparedCat(
  data: CatProfileFormData,
  householdId: string | undefined,
  cat?: Cat | null,
) {
  const dateOfBirthMs = parseDateInputValue(data.dateOfBirth) ?? cat?.dateOfBirth ?? 0;
  const adoptedAtMs = parseDateInputValue(data.adoptedAt);
  const keyDates = data.customKeyDates
    .filter((entry) => entry.label.trim() && entry.date > 0)
    .map((entry) => ({
      date: entry.date,
      label: entry.label.trim(),
    }));
  const nextInsurance = buildCatInsurance(
    data.insuranceProvider,
    data.insurancePolicyNumber,
  );
  const result: Cat = {
    id: cat?.id ?? '',
    householdId: householdId ?? cat?.householdId ?? 'new-household',
    name: data.name.trim(),
    breed: data.breed.trim() || CAT_BREEDS[0],
    dateOfBirth: dateOfBirthMs,
    isDateOfBirthEstimated: data.isDateOfBirthEstimated,
    lifestyle: data.lifestyle,
    microchipNumber: data.microchipNumber.trim() || undefined,
    shelterOrigin:
      data.shelterName || data.shelterAddress
        ? {
            name: data.shelterName.trim() || 'Unknown shelter',
            address: data.shelterAddress.trim() || undefined,
          }
        : undefined,
    adoptedAt: adoptedAtMs,
    customKeyDates: keyDates.length > 0 ? keyDates : undefined,
    insurance: nextInsurance,
    notes: data.notes.trim() || undefined,
    createdBy: cat?.createdBy ?? 'current-user',
    createdAt: cat?.createdAt ?? 0,
    lastEditedAt: cat?.lastEditedAt ?? 0,
  };

  return result;
}

function CatProfileForm({
  cat,
  householdId,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: CatProfileFormProps) {
  const initialData = useMemo(() => buildInitialData(cat), [cat]);
  const formId = cat?.id ?? `${householdId ?? 'new-household'}-cat-profile`;

  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Name',
        placeholder: 'Mochi',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'breed',
        label: 'Breed',
        options: breedOptions,
        searchable: true,
      }),
      custom({
        name: 'dateOfBirth',
        label: 'Date of birth',
        renderComponent: DateField,
      }),
      select({
        name: 'lifestyle',
        label: 'Lifestyle',
        options: lifestyleOptions,
      }),
      checkbox({
        name: 'isDateOfBirthEstimated',
        label: 'Date of birth is estimated',
        text: 'Date of birth is estimated',
      }),
      input({
        name: 'microchipNumber',
        label: 'Microchip',
        placeholder: 'Microchip number',
        variant: 'outline',
      }),
      input({
        name: 'shelterName',
        label: 'Shelter / origin',
        placeholder: 'Shelter name',
        variant: 'outline',
      }),
      input({
        name: 'shelterAddress',
        label: 'Shelter address',
        placeholder: 'Address',
        variant: 'outline',
      }),
      custom({
        name: 'adoptedAt',
        label: 'Adoption date',
        renderComponent: DateField,
      }),
      select({
        name: 'insuranceProvider',
        label: 'Insurance provider',
        options: insuranceProviderOptions,
        searchable: true,
      }),
      input({
        name: 'insurancePolicyNumber',
        label: 'Insurance policy number',
        placeholder: 'Policy number',
        variant: 'outline',
        colSpan: 'full',
      }),
      custom({
        name: 'customKeyDates',
        label: 'Key dates',
        renderComponent: KeyDatesField,
        colSpan: 'full',
      }),
      textarea({
        name: 'notes',
        label: 'Notes',
        placeholder: 'Care notes, quirks, or anything relevant',
        rows: 4,
        variant: 'outline',
        colSpan: 'full',
      }),
    ],
    [],
  );

  const submitLabel = isSubmitting ? 'Saving…' : cat ? 'Save changes' : 'Create cat';

  const handleSubmit = async (data: CatProfileFormData) => {
    const nextCatValue = buildPreparedCat(data, householdId, cat);
    const preparedCat: Cat = {
      ...nextCatValue,
      createdAt: nextCatValue.createdAt || Date.now(),
      lastEditedAt: Date.now(),
    };

    await onSubmit(preparedCat);
  };

  return (
    <Form
      key={formId}
      id={formId}
      form={fields}
      initialData={initialData}
      columns={2}
      spacing='normal'
      className='rounded-xl border border-border bg-card p-4'
      onSubmit={(data) => {
        void handleSubmit(data as CatProfileFormData);
      }}
      submitButton={
        <div className='col-span-full flex justify-end gap-3'>
          {onCancel && (
            <Button type='button' variant='secondary' onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type='submit' loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      }
    />
  );
}

export default CatProfileForm;
