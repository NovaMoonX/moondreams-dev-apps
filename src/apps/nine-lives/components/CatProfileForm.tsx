import { useMemo } from 'react';

import { Button, Form, FormFactories, Input } from '@moondreamsdev/dreamer-ui/components';

import {
  CAT_BREEDS,
  CUSTOM_BREED_OPTION,
  INSURANCE_PROVIDER_OPTIONS,
} from '@apps/nine-lives/constants/presetOptions';
import type { Cat, CatInsurance, CatKeyDate, CatLifestyle } from '@apps/nine-lives/types';
import { fromDateInputValue, toDateInputValue } from '@/utils';

interface CatProfileFormProps {
  householdId?: string;
  cat?: Cat | null;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onCancel?: () => void;
}

interface CatProfileFormData {
  name: string;
  breedPreset: string;
  customBreed: string;
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
interface KeyDatesFieldProps {
  value: CatKeyDate[];
  onValueChange: (value: CatKeyDate[]) => void;
  disabled?: boolean;
}

const defaultLifestyle: CatLifestyle = 'indoor';
const { checkbox, custom, input, select, textarea } = FormFactories;
type FormInputFactoryField = Parameters<typeof input>[0];

const breedOptions = [
  ...CAT_BREEDS.map((option) => ({
    label: option,
    value: option,
  })),
  {
    label: 'Custom breed',
    value: CUSTOM_BREED_OPTION,
  },
];

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

function KeyDatesField({ value, onValueChange, disabled }: KeyDatesFieldProps) {
  const keyDates = value.length > 0 ? value : [{ label: '', date: 0 }];

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
        const dateValue = toDateInputValue(entry.date);

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
                  date: fromDateInputValue(event.target.value) ?? 0,
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

  const result = {
    provider: provider || 'Other',
    policyNumber: policyNumber || 'Unspecified',
  };

  return result;
}

// TASK: need to verify this renders as it should
function createDateInputField(field: Omit<FormInputFactoryField, 'type'>) {
  const result = input({
    ...field,
    type: 'date',
  } as unknown as FormInputFactoryField);

  return result;
}

function getBreedInitialData(cat?: Cat | null) {
  const savedBreed = cat?.breed ?? CAT_BREEDS[0];
  const isPresetBreed = CAT_BREEDS.some((option) => option === savedBreed);
  const result = {
    breedPreset: isPresetBreed ? savedBreed : CUSTOM_BREED_OPTION,
    customBreed: isPresetBreed ? '' : savedBreed,
  };

  return result;
}

function buildInitialData(cat?: Cat | null): CatProfileFormData {
  const breedState = getBreedInitialData(cat);
  const result: CatProfileFormData = {
    name: cat?.name ?? '',
    breedPreset: breedState.breedPreset,
    customBreed: breedState.customBreed,
    dateOfBirth: toDateInputValue(cat?.dateOfBirth),
    isDateOfBirthEstimated: cat?.isDateOfBirthEstimated ?? false,
    lifestyle: cat?.lifestyle ?? defaultLifestyle,
    microchipNumber: cat?.microchipNumber ?? '',
    shelterName: cat?.shelterOrigin?.name ?? '',
    shelterAddress: cat?.shelterOrigin?.address ?? '',
    adoptedAt: toDateInputValue(cat?.adoptedAt),
    insuranceProvider: cat?.insurance?.provider ?? INSURANCE_PROVIDER_OPTIONS[0],
    insurancePolicyNumber: cat?.insurance?.policyNumber ?? '',
    customKeyDates: cat?.customKeyDates ?? [{ label: '', date: 0 }],
    notes: cat?.notes ?? '',
  };

  return result;
}

function resolveBreed(data: CatProfileFormData) {
  const chosenBreed =
    data.breedPreset === CUSTOM_BREED_OPTION ? data.customBreed : data.breedPreset;
  const result = chosenBreed.trim() || CAT_BREEDS[0];

  return result;
}

function buildPreparedCat(
  data: CatProfileFormData,
  householdId: string | undefined,
  cat?: Cat | null,
) {
  const dateOfBirthMs = fromDateInputValue(data.dateOfBirth) ?? cat?.dateOfBirth ?? 0;
  const adoptedAtMs = fromDateInputValue(data.adoptedAt);
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
    breed: resolveBreed(data),
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
        name: 'breedPreset',
        label: 'Breed',
        options: breedOptions,
        searchable: true,
      }),
      input({
        name: 'customBreed',
        label: 'Custom breed',
        placeholder: 'Enter a breed if it is not listed',
        description: 'Use this when the preset list does not match your cat.',
        variant: 'outline',
      }),
      createDateInputField({
        name: 'dateOfBirth',
        label: 'Date of birth',
        variant: 'outline',
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
      createDateInputField({
        name: 'adoptedAt',
        label: 'Adoption date',
        variant: 'outline',
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
        renderComponent: (props) => (
          <KeyDatesField
            value={Array.isArray(props.value) ? (props.value as CatKeyDate[]) : []}
            onValueChange={(value) => props.onValueChange(value)}
            disabled={props.disabled}
          />
        ),
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
    <div className='space-y-3 rounded-xl border border-border bg-card p-4'>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={initialData}
        columns={2}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as CatProfileFormData);
        }}
        submitButton={
          <div className='col-span-full flex justify-end'>
            <Button type='submit' loading={isSubmitting}>
              {submitLabel}
            </Button>
          </div>
        }
      />
      {onCancel && (
        <div className='flex justify-end'>
          <Button type='button' variant='secondary' onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default CatProfileForm;
