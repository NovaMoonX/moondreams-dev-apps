import { useMemo } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';

import ImageUploadField from '@/components/forms/ImageUploadField';
import { useImageUpload } from '@/hooks/useImageUpload';
import {
  createDateInputField,
  fromDateInputValue,
  toDateInputValue,
} from '@/utils';
import { getInitials } from '@/utils/accountUtils';
import { deleteFile, uploadFile } from '@lib/firebase/storage';
import { INSURANCE_PROVIDER_OPTIONS } from '@apps/nine-lives/constants/presetOptions';
import type {
  Cat,
  CatInsurance,
  CatKeyDate,
  CatLifestyle,
} from '@apps/nine-lives/types';
import {
  getBreedInitialValue,
  resolveBreedValue,
  type BreedValue,
} from '@apps/nine-lives/utils/breedUtils';

import BreedField from './BreedField';
import DetailsDisclosure from './DetailsDisclosure';

interface CatProfileFormProps {
  householdId?: string;
  cat?: Cat | null;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
}

interface InsuranceProviderValue {
  preset: string;
  customProvider: string;
}

interface AdditionalDetailsValue {
  microchipNumber: string;
  shelterName: string;
  shelterAddress: string;
  adoptedAt: string;
  insuranceProviderSelection: InsuranceProviderValue;
  insurancePolicyNumber: string;
  customKeyDates: CatKeyDate[];
  notes: string;
}

interface CatProfileFormData {
  name: string;
  breed: BreedValue;
  dateOfBirth: string;
  isDateOfBirthEstimated: boolean;
  lifestyle: CatLifestyle;
  additionalDetails: AdditionalDetailsValue;
}

const defaultLifestyle: CatLifestyle = 'indoor';
const { checkbox, custom, input, select } = FormFactories;

const insuranceProviderOptions = INSURANCE_PROVIDER_OPTIONS.map((option) => ({
  text: option,
  value: option,
}));

const OTHER_INSURANCE_PROVIDER = 'Other';

const lifestyleOptions = [
  { label: 'Indoor', value: 'indoor' },
  { label: 'Outdoor', value: 'outdoor' },
  { label: 'Indoor + outdoor', value: 'indoor_outdoor' },
];

function resolveInsuranceProvider(selection: InsuranceProviderValue) {
  if (selection.preset === OTHER_INSURANCE_PROVIDER) {
    return selection.customProvider.trim() || OTHER_INSURANCE_PROVIDER;
  }

  return selection.preset;
}

function buildCatInsurance(
  providerSelection: InsuranceProviderValue,
  policyNumber: string,
): CatInsurance | null {
  const provider = resolveInsuranceProvider(providerSelection);

  if (!provider && !policyNumber) {
    return null;
  }

  const result: CatInsurance = {
    provider: provider || 'Other',
    policyNumber: policyNumber || 'Unspecified',
    monthlyPremium: null,
    coverageStartDate: null,
    coverageNotes: null,
  };

  return result;
}

function getInsuranceProviderInitialValue(
  cat?: Cat | null,
): InsuranceProviderValue {
  const savedProvider = cat?.insurance?.provider;

  if (!savedProvider) {
    return { preset: INSURANCE_PROVIDER_OPTIONS[0], customProvider: '' };
  }

  const isPresetProvider = INSURANCE_PROVIDER_OPTIONS.some(
    (option) => option === savedProvider && option !== OTHER_INSURANCE_PROVIDER,
  );

  if (isPresetProvider) {
    return { preset: savedProvider, customProvider: '' };
  }

  return { preset: OTHER_INSURANCE_PROVIDER, customProvider: savedProvider };
}

function getAdditionalDetailsInitialValue(
  cat?: Cat | null,
): AdditionalDetailsValue {
  return {
    microchipNumber: cat?.microchipNumber ?? '',
    shelterName: cat?.shelterOrigin?.name ?? '',
    shelterAddress: cat?.shelterOrigin?.address ?? '',
    adoptedAt: toDateInputValue(cat?.adoptedAt ?? undefined),
    insuranceProviderSelection: getInsuranceProviderInitialValue(cat),
    insurancePolicyNumber: cat?.insurance?.policyNumber ?? '',
    customKeyDates: cat?.customKeyDates ?? [{ label: '', date: 0 }],
    notes: cat?.notes ?? '',
  };
}

interface AdditionalDetailsFieldsProps {
  value: AdditionalDetailsValue;
  onValueChange: (value: AdditionalDetailsValue) => void;
  disabled?: boolean;
}

function AdditionalDetailsFields({
  value,
  onValueChange,
  disabled,
}: AdditionalDetailsFieldsProps) {
  const update = (changes: Partial<AdditionalDetailsValue>) =>
    onValueChange({ ...value, ...changes });

  const keyDates =
    value.customKeyDates.length > 0
      ? value.customKeyDates
      : [{ label: '', date: 0 }];

  const updateKeyDate = (index: number, changes: Partial<CatKeyDate>) => {
    const nextKeyDates = keyDates.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, ...changes } : entry,
    );
    update({ customKeyDates: nextKeyDates });
  };

  return (
    <div className='space-y-3'>
      <DetailsDisclosure label='Origin & identification'>
        <div className='grid gap-3 md:grid-cols-2'>
          <div className='space-y-1'>
            <Label className='text-sm'>Microchip</Label>
            <Input
              value={value.microchipNumber}
              onChange={(event) =>
                update({ microchipNumber: event.target.value })
              }
              placeholder='Microchip number'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Shelter / origin</Label>
            <Input
              value={value.shelterName}
              onChange={(event) => update({ shelterName: event.target.value })}
              placeholder='Shelter name'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Shelter address</Label>
            <Input
              value={value.shelterAddress}
              onChange={(event) =>
                update({ shelterAddress: event.target.value })
              }
              placeholder='Address'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Adoption date</Label>
            <Input
              type='date'
              value={value.adoptedAt}
              onChange={(event) => update({ adoptedAt: event.target.value })}
              variant='outline'
              disabled={disabled}
            />
          </div>
        </div>
      </DetailsDisclosure>

      <DetailsDisclosure label='Insurance'>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label className='text-sm'>Insurance provider</Label>
            <Select
              options={insuranceProviderOptions}
              value={value.insuranceProviderSelection.preset}
              onChange={(nextPreset) =>
                update({
                  insuranceProviderSelection: {
                    ...value.insuranceProviderSelection,
                    preset: nextPreset,
                  },
                })
              }
              searchable
              disabled={disabled}
            />
            {value.insuranceProviderSelection.preset !==
              OTHER_INSURANCE_PROVIDER && (
              <div className='flex justify-end'>
                <Button
                  variant='link'
                  size='sm'
                  type='button'
                  onClick={() =>
                    update({
                      insuranceProviderSelection: {
                        preset: OTHER_INSURANCE_PROVIDER,
                        customProvider: '',
                      },
                    })
                  }
                  disabled={disabled}
                  className='text-muted-foreground hover:text-foreground text-xs'
                >
                  Don't see your provider? Click here to enter a custom
                  provider.
                </Button>
              </div>
            )}
          </div>
          {value.insuranceProviderSelection.preset ===
            OTHER_INSURANCE_PROVIDER && (
            <div className='space-y-1'>
              <Label className='text-sm'>Provider name</Label>
              <Input
                value={value.insuranceProviderSelection.customProvider}
                onChange={(event) =>
                  update({
                    insuranceProviderSelection: {
                      ...value.insuranceProviderSelection,
                      customProvider: event.target.value,
                    },
                  })
                }
                placeholder='Enter insurance provider name'
                variant='outline'
                disabled={disabled}
              />
            </div>
          )}
          <div className='space-y-1'>
            <Label className='text-sm'>Insurance policy number</Label>
            <Input
              value={value.insurancePolicyNumber}
              onChange={(event) =>
                update({ insurancePolicyNumber: event.target.value })
              }
              placeholder='Policy number'
              variant='outline'
              disabled={disabled}
            />
          </div>
        </div>
      </DetailsDisclosure>

      <DetailsDisclosure label='Key dates'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <p className='text-muted-foreground text-sm'>
              Add memorable dates for this cat.
            </p>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() =>
                update({
                  customKeyDates: [...keyDates, { label: '', date: 0 }],
                })
              }
              disabled={disabled}
            >
              Add date
            </Button>
          </div>

          {keyDates.map((entry, index) => (
            <div
              key={`${entry.label}-${index}`}
              className='grid gap-3 md:grid-cols-2'
            >
              <div className='space-y-1'>
                <Input
                  value={entry.label}
                  onChange={(event) =>
                    updateKeyDate(index, { label: event.target.value })
                  }
                  variant='outline'
                  placeholder='e.g. Spayed/neutered'
                  disabled={disabled}
                />
              </div>
              <div className='space-y-1'>
                <Input
                  type='date'
                  value={toDateInputValue(entry.date)}
                  onChange={(event) =>
                    updateKeyDate(index, {
                      date: fromDateInputValue(event.target.value) ?? 0,
                    })
                  }
                  variant='outline'
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>
      </DetailsDisclosure>

      <div className='space-y-1'>
        <Label className='text-sm'>Notes</Label>
        <Textarea
          value={value.notes}
          onChange={(event) => update({ notes: event.target.value })}
          placeholder='Care notes, quirks, or anything relevant'
          rows={4}
          disabled={disabled}
          variant='outline'
        />
      </div>
    </div>
  );
}

function buildInitialData(cat?: Cat | null): CatProfileFormData {
  return {
    name: cat?.name ?? '',
    breed: getBreedInitialValue(cat?.breed),
    dateOfBirth: toDateInputValue(cat?.dateOfBirth),
    isDateOfBirthEstimated: cat?.isDateOfBirthEstimated ?? false,
    lifestyle: cat?.lifestyle ?? defaultLifestyle,
    additionalDetails: getAdditionalDetailsInitialValue(cat),
  };
}

function buildPreparedCat(
  data: CatProfileFormData,
  householdId: string | undefined,
  cat?: Cat | null,
) {
  const dateOfBirthMs =
    fromDateInputValue(data.dateOfBirth) ?? cat?.dateOfBirth ?? 0;
  const adoptedAtMs =
    fromDateInputValue(data.additionalDetails.adoptedAt) ?? null;
  const keyDates = data.additionalDetails.customKeyDates
    .filter((entry) => entry.label.trim() && entry.date > 0)
    .map((entry) => ({ date: entry.date, label: entry.label.trim() }));
  const nextInsurance = buildCatInsurance(
    data.additionalDetails.insuranceProviderSelection,
    data.additionalDetails.insurancePolicyNumber,
  );
  const result: Cat = {
    id: cat?.id ?? '',
    householdId: householdId ?? cat?.householdId ?? 'new-household',
    name: data.name.trim(),
    breed: resolveBreedValue(data.breed),
    dateOfBirth: dateOfBirthMs,
    isDateOfBirthEstimated: data.isDateOfBirthEstimated,
    photoURL: cat?.photoURL ?? null,
    lifestyle: data.lifestyle,
    microchipNumber: data.additionalDetails.microchipNumber.trim() || null,
    shelterOrigin:
      data.additionalDetails.shelterName ||
      data.additionalDetails.shelterAddress
        ? {
            name:
              data.additionalDetails.shelterName.trim() || 'Unknown shelter',
            address: data.additionalDetails.shelterAddress.trim() || null,
          }
        : null,
    adoptedAt: adoptedAtMs,
    customKeyDates: keyDates.length > 0 ? keyDates : null,
    diet: cat?.diet ?? null,
    currentClinicId: cat?.currentClinicId ?? null,
    insurance: nextInsurance,
    personalityTraits: cat?.personalityTraits ?? null,
    notes: data.additionalDetails.notes.trim() || null,
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
  onDelete,
}: CatProfileFormProps) {
  const initialData = useMemo(() => buildInitialData(cat), [cat]);
  const formId = cat?.id ?? `${householdId ?? 'new-household'}-cat-profile`;
  const photoUpload = useImageUpload(cat?.photoURL ?? null);
  const photoRemoved =
    photoUpload.previewUrl === null && Boolean(cat?.photoURL);

  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Name',
        placeholder: 'Mochi',
        required: true,
        variant: 'outline',
      }),
      custom({
        name: 'breed',
        label: 'Breed',
        renderComponent: (props) => (
          <BreedField
            value={props.value as BreedValue}
            onValueChange={(value) => props.onValueChange(value)}
            disabled={props.disabled}
          />
        ),
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
      custom({
        name: 'additionalDetails',
        label: 'More details (optional)',
        renderComponent: (props) => (
          <AdditionalDetailsFields
            value={props.value as AdditionalDetailsValue}
            onValueChange={(value) => props.onValueChange(value)}
            disabled={props.disabled}
          />
        ),
        colSpan: 'full',
      }),
    ],
    [],
  );

  const submitLabel = isSubmitting
    ? 'Saving…'
    : cat
      ? 'Save changes'
      : 'Create cat';

  const handleSubmit = async (data: CatProfileFormData) => {
    const nextCatValue = buildPreparedCat(data, householdId, cat);
    let photoURL = nextCatValue.photoURL;

    if (cat?.id && householdId) {
      const photoPath = `nine-lives/households/${householdId}/cats/${cat.id}/photo`;

      if (photoUpload.file) {
        photoURL = await uploadFile(photoPath, photoUpload.file);
      } else if (photoRemoved) {
        await deleteFile(photoPath);
        photoURL = null;
      }
    }

    const preparedCat: Cat = {
      ...nextCatValue,
      photoURL,
      createdAt: nextCatValue.createdAt || Date.now(),
      lastEditedAt: Date.now(),
    };

    await onSubmit(preparedCat);
  };

  return (
    <div className='space-y-4'>
      <ImageUploadField
        previewUrl={photoUpload.previewUrl}
        initials={
          photoUpload.previewUrl
            ? undefined
            : getInitials(initialData.name || 'New cat')
        }
        error={photoUpload.error}
        disabled={isSubmitting}
        onSelect={photoUpload.pick}
        onRemove={photoUpload.clear}
      />
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
          <div className='col-span-full flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              {onDelete && (
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => void onDelete()}
                  disabled={isSubmitting}
                >
                  Delete cat
                </Button>
              )}
            </div>
            <div className='flex items-center gap-2'>
              {onCancel && (
                <Button type='button' variant='secondary' onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type='submit' loading={isSubmitting}>
                {submitLabel}
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}

export default CatProfileForm;
