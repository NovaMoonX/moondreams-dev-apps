import { useMemo, useState } from 'react';

import { Button, Form, FormFactories, Input, Label, Select, Textarea } from '@moondreamsdev/dreamer-ui/components';

import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import {
  COAT_COLOR_OPTIONS,
  INSURANCE_PROVIDER_OPTIONS,
  NONE_INSURANCE_PROVIDER,
  PERSONALITY_TRAIT_OPTIONS,
} from '@apps/nine-lives/constants/presetOptions';
import type { Cat, CatInsurance, CatKeyDate, CatLifestyle, CatLink, CatSex } from '@apps/nine-lives/types';
import { getBreedInitialValue, resolveBreedValue, type BreedValue } from '@apps/nine-lives/utils/breedUtils';

import BreedField from './BreedField';
import DetailsDisclosure from './DetailsDisclosure';
import ModalFooterActions from './ModalFooterActions';
import TagPickerField from './TagPickerField';

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
  originalName: string;
  rabiesTagNumber: string;
  microchipNumber: string;
  microchipServiceURL: string;
  shelterName: string;
  shelterAddress: string;
  adoptedAt: string;
  adoptionProfileURL: string;
  otherLinks: CatLink[];
  insuranceProviderSelection: InsuranceProviderValue;
  insurancePolicyNumber: string;
  customKeyDates: CatKeyDate[];
  notes: string;
}

interface CatProfileFormData {
  name: string;
  breed: BreedValue;
  coatColors: string[];
  dateOfBirth: string;
  isDateOfBirthEstimated: boolean;
  sex: CatSex;
  lifestyle: CatLifestyle;
  isSpayedNeutered: boolean;
  spayedNeuteredAt: string;
  personalityTraits: string[];
  additionalDetails: AdditionalDetailsValue;
}

const defaultLifestyle: CatLifestyle = 'indoor';
const { checkbox, custom, input, select } = FormFactories;

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const insuranceProviderOptions = INSURANCE_PROVIDER_OPTIONS.map((option) => ({
  text: option,
  value: option,
}));

const OTHER_INSURANCE_PROVIDER = 'Other';

const sexOptions = [
  { label: 'Unknown', value: 'unknown' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

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

function buildCatInsurance(providerSelection: InsuranceProviderValue, policyNumber: string): CatInsurance | null {
  if (providerSelection.preset === NONE_INSURANCE_PROVIDER) {
    return null;
  }

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

function getInsuranceProviderInitialValue(cat?: Cat | null): InsuranceProviderValue {
  const savedProvider = cat?.insurance?.provider;

  if (!savedProvider) {
    return { preset: NONE_INSURANCE_PROVIDER, customProvider: '' };
  }

  const isPresetProvider = INSURANCE_PROVIDER_OPTIONS.some(
    (option) => option === savedProvider && option !== OTHER_INSURANCE_PROVIDER,
  );

  if (isPresetProvider) {
    return { preset: savedProvider, customProvider: '' };
  }

  return { preset: OTHER_INSURANCE_PROVIDER, customProvider: savedProvider };
}

function getAdditionalDetailsInitialValue(cat?: Cat | null): AdditionalDetailsValue {
  return {
    originalName: cat?.originalName ?? '',
    rabiesTagNumber: cat?.rabiesTagNumber ?? '',
    microchipNumber: cat?.microchipNumber ?? '',
    microchipServiceURL: cat?.microchipServiceURL ?? '',
    shelterName: cat?.shelterOrigin?.name ?? '',
    shelterAddress: cat?.shelterOrigin?.address ?? '',
    adoptedAt: toDateInputValue(cat?.adoptedAt ?? undefined),
    adoptionProfileURL: cat?.adoptionProfileURL ?? '',
    otherLinks: cat?.otherLinks?.length ? cat.otherLinks : [],
    insuranceProviderSelection: getInsuranceProviderInitialValue(cat),
    insurancePolicyNumber: cat?.insurance?.policyNumber ?? '',
    customKeyDates: cat?.customKeyDates?.length
      ? cat.customKeyDates
      : [{ id: createId(), label: '', date: 0 }],
    notes: cat?.notes ?? '',
  };
}

interface AdditionalDetailsFieldsProps {
  value: AdditionalDetailsValue;
  onValueChange: (value: AdditionalDetailsValue) => void;
  disabled?: boolean;
}

function AdditionalDetailsFields({ value, onValueChange, disabled }: AdditionalDetailsFieldsProps) {
  const update = (changes: Partial<AdditionalDetailsValue>) => onValueChange({ ...value, ...changes });

  const keyDates = value.customKeyDates.length > 0 ? value.customKeyDates : [{ id: createId(), label: '', date: 0 }];
  const otherLinks = value.otherLinks;

  const updateKeyDate = (id: string, changes: Partial<CatKeyDate>) => {
    update({ customKeyDates: keyDates.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) });
  };

  const updateLink = (id: string, changes: Partial<CatLink>) => {
    update({ otherLinks: otherLinks.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) });
  };

  const isNoneProvider = value.insuranceProviderSelection.preset === NONE_INSURANCE_PROVIDER;

  return (
    <div className='space-y-3'>
      <DetailsDisclosure label='Origin & identification'>
        <div className='grid gap-3 md:grid-cols-2'>
          <div className='space-y-1'>
            <Label className='text-sm'>Original name</Label>
            <Input
              value={value.originalName}
              onChange={(event) => update({ originalName: event.target.value })}
              placeholder='Name given before adoption'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Rabies tag number</Label>
            <Input
              value={value.rabiesTagNumber}
              onChange={(event) => update({ rabiesTagNumber: event.target.value })}
              placeholder='Rabies tag number'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Microchip</Label>
            <Input
              value={value.microchipNumber}
              onChange={(event) => update({ microchipNumber: event.target.value })}
              placeholder='Microchip number'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Microchip service link</Label>
            <Input
              value={value.microchipServiceURL}
              onChange={(event) => update({ microchipServiceURL: event.target.value })}
              placeholder='e.g. https://www.petlink.net'
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
              onChange={(event) => update({ shelterAddress: event.target.value })}
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
          <div className='space-y-1'>
            <Label className='text-sm'>Adoption profile link</Label>
            <Input
              value={value.adoptionProfileURL}
              onChange={(event) => update({ adoptionProfileURL: event.target.value })}
              placeholder='Link to the original adoption listing'
              variant='outline'
              disabled={disabled}
            />
          </div>
        </div>
      </DetailsDisclosure>

      <DetailsDisclosure label='Other links'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <p className='text-muted-foreground text-sm'>Any other useful links for this cat.</p>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => update({ otherLinks: [...otherLinks, { id: createId(), label: '', url: '' }] })}
              disabled={disabled}
            >
              Add link
            </Button>
          </div>

          {otherLinks.map((entry) => (
            <div key={entry.id} className='grid gap-3 md:grid-cols-2'>
              <Input
                value={entry.label}
                onChange={(event) => updateLink(entry.id, { label: event.target.value })}
                variant='outline'
                placeholder='Label, e.g. Pet insurance portal'
                disabled={disabled}
              />
              <div className='flex items-center gap-2'>
                <Input
                  value={entry.url}
                  onChange={(event) => updateLink(entry.id, { url: event.target.value })}
                  variant='outline'
                  placeholder='https://...'
                  disabled={disabled}
                />
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => update({ otherLinks: otherLinks.filter((link) => link.id !== entry.id) })}
                  disabled={disabled}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
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
                  insuranceProviderSelection: { ...value.insuranceProviderSelection, preset: nextPreset },
                  ...(nextPreset === NONE_INSURANCE_PROVIDER ? { insurancePolicyNumber: '' } : {}),
                })
              }
              searchable
              disabled={disabled}
            />
            {value.insuranceProviderSelection.preset !== OTHER_INSURANCE_PROVIDER && (
              <div className='flex justify-end'>
                <Button
                  variant='link'
                  size='sm'
                  type='button'
                  onClick={() =>
                    update({
                      insuranceProviderSelection: { preset: OTHER_INSURANCE_PROVIDER, customProvider: '' },
                    })
                  }
                  disabled={disabled}
                  className='text-muted-foreground hover:text-foreground text-xs'
                >
                  Don't see your provider? Click here to enter a custom provider.
                </Button>
              </div>
            )}
          </div>
          {value.insuranceProviderSelection.preset === OTHER_INSURANCE_PROVIDER && (
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
              onChange={(event) => update({ insurancePolicyNumber: event.target.value })}
              placeholder='Policy number'
              variant='outline'
              disabled={disabled || isNoneProvider}
            />
          </div>
        </div>
      </DetailsDisclosure>

      <DetailsDisclosure label='Key dates'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <p className='text-muted-foreground text-sm'>Add memorable dates for this cat.</p>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => update({ customKeyDates: [...keyDates, { id: createId(), label: '', date: 0 }] })}
              disabled={disabled}
            >
              Add date
            </Button>
          </div>

          {keyDates.map((entry) => (
            <div key={entry.id} className='grid gap-3 md:grid-cols-2'>
              <div className='space-y-1'>
                <Input
                  value={entry.label}
                  onChange={(event) => updateKeyDate(entry.id, { label: event.target.value })}
                  variant='outline'
                  placeholder='e.g. Microchipped'
                  disabled={disabled}
                />
              </div>
              <div className='space-y-1'>
                <Input
                  type='date'
                  value={toDateInputValue(entry.date)}
                  onChange={(event) =>
                    updateKeyDate(entry.id, { date: fromDateInputValue(event.target.value) ?? 0 })
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
    coatColors: cat?.coatColors ?? [],
    dateOfBirth: toDateInputValue(cat?.dateOfBirth),
    isDateOfBirthEstimated: cat?.isDateOfBirthEstimated ?? false,
    sex: cat?.sex ?? 'unknown',
    lifestyle: cat?.lifestyle ?? defaultLifestyle,
    isSpayedNeutered: cat?.isSpayedNeutered ?? false,
    spayedNeuteredAt: toDateInputValue(cat?.spayedNeuteredAt ?? undefined),
    personalityTraits: cat?.personalityTraits ?? [],
    additionalDetails: getAdditionalDetailsInitialValue(cat),
  };
}

function buildPreparedCat(data: CatProfileFormData, householdId: string | undefined, cat?: Cat | null) {
  const dateOfBirthMs = fromDateInputValue(data.dateOfBirth) ?? cat?.dateOfBirth ?? 0;
  const adoptedAtMs = fromDateInputValue(data.additionalDetails.adoptedAt) ?? null;
  const spayedNeuteredAtMs = data.isSpayedNeutered ? (fromDateInputValue(data.spayedNeuteredAt) ?? null) : null;
  const keyDates = data.additionalDetails.customKeyDates
    .filter((entry) => entry.label.trim() && entry.date > 0)
    .map((entry) => ({ id: entry.id, date: entry.date, label: entry.label.trim() }));
  const otherLinks = data.additionalDetails.otherLinks
    .filter((entry) => entry.label.trim() && entry.url.trim())
    .map((entry) => ({ id: entry.id, label: entry.label.trim(), url: entry.url.trim() }));
  const nextInsurance = buildCatInsurance(
    data.additionalDetails.insuranceProviderSelection,
    data.additionalDetails.insurancePolicyNumber,
  );
  const result: Cat = {
    id: cat?.id ?? '',
    householdId: householdId ?? cat?.householdId ?? 'new-household',
    name: data.name.trim(),
    originalName: data.additionalDetails.originalName.trim() || null,
    breed: resolveBreedValue(data.breed),
    coatColors: data.coatColors.length > 0 ? data.coatColors : null,
    dateOfBirth: dateOfBirthMs,
    isDateOfBirthEstimated: data.isDateOfBirthEstimated,
    sex: data.sex,
    photoURL: cat?.photoURL ?? null,
    lifestyle: data.lifestyle,
    microchipNumber: data.additionalDetails.microchipNumber.trim() || null,
    microchipServiceURL: data.additionalDetails.microchipServiceURL.trim() || null,
    rabiesTagNumber: data.additionalDetails.rabiesTagNumber.trim() || null,
    isSpayedNeutered: data.isSpayedNeutered,
    spayedNeuteredAt: spayedNeuteredAtMs,
    shelterOrigin:
      data.additionalDetails.shelterName || data.additionalDetails.shelterAddress
        ? {
            name: data.additionalDetails.shelterName.trim() || 'Unknown shelter',
            address: data.additionalDetails.shelterAddress.trim() || null,
          }
        : null,
    adoptedAt: adoptedAtMs,
    adoptionProfileURL: data.additionalDetails.adoptionProfileURL.trim() || null,
    otherLinks: otherLinks.length > 0 ? otherLinks : null,
    customKeyDates: keyDates.length > 0 ? keyDates : null,
    diet: cat?.diet ?? null,
    currentClinicId: cat?.currentClinicId ?? null,
    insurance: nextInsurance,
    personalityTraits: data.personalityTraits.length > 0 ? data.personalityTraits : null,
    notes: data.additionalDetails.notes.trim() || null,
    createdBy: cat?.createdBy ?? 'current-user',
    createdAt: cat?.createdAt ?? 0,
    lastEditedAt: cat?.lastEditedAt ?? 0,
  };

  return result;
}

function CatProfileForm({ cat, householdId, isSubmitting = false, onSubmit, onCancel, onDelete }: CatProfileFormProps) {
  const initialData = useMemo(() => buildInitialData(cat), [cat]);
  const formId = cat?.id ?? `${householdId ?? 'new-household'}-cat-profile`;
  const [isValid, setIsValid] = useState(Boolean(initialData.name.trim() && initialData.dateOfBirth));

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
          <BreedField value={props.value as BreedValue} onValueChange={(value) => props.onValueChange(value)} disabled={props.disabled} />
        ),
      }),
      custom({
        name: 'coatColors',
        label: 'Coat colors',
        renderComponent: (props) => (
          <TagPickerField
            value={props.value as string[]}
            onValueChange={props.onValueChange}
            presetOptions={COAT_COLOR_OPTIONS}
            ariaLabel='Coat colors'
            addLabel='Add a custom color'
            disabled={props.disabled}
          />
        ),
      }),
      createDateInputField({
        name: 'dateOfBirth',
        label: 'Date of birth',
        required: true,
        variant: 'outline',
      }),
      checkbox({
        name: 'isDateOfBirthEstimated',
        label: 'Date of birth is estimated',
        text: 'Date of birth is estimated',
      }),
      select({
        name: 'sex',
        label: 'Sex',
        options: sexOptions,
      }),
      select({
        name: 'lifestyle',
        label: 'Lifestyle',
        options: lifestyleOptions,
      }),
      checkbox({
        name: 'isSpayedNeutered',
        label: 'Spayed / neutered',
        text: 'Spayed / neutered',
      }),
      createDateInputField({
        name: 'spayedNeuteredAt',
        label: 'Spayed / neutered date (optional)',
        variant: 'outline',
      }),
      custom({
        name: 'personalityTraits',
        label: 'Personality traits',
        renderComponent: (props) => (
          <TagPickerField
            value={props.value as string[]}
            onValueChange={props.onValueChange}
            presetOptions={PERSONALITY_TRAIT_OPTIONS}
            ariaLabel='Personality traits'
            disabled={props.disabled}
          />
        ),
        colSpan: 'full',
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
      onDataChange={(data) => {
        const values = data as CatProfileFormData;
        setIsValid(Boolean(values.name.trim() && values.dateOfBirth));
      }}
      onSubmit={(data) => {
        void handleSubmit(data as CatProfileFormData);
      }}
      submitButton={
        <ModalFooterActions
          leftActions={
            onDelete && (
              <Button type='button' variant='secondary' onClick={() => void onDelete()} disabled={isSubmitting}>
                Delete cat
              </Button>
            )
          }
          rightActions={
            <>
              {onCancel && (
                <Button type='button' variant='secondary' onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {submitLabel}
              </Button>
            </>
          }
        />
      }
    />
  );
}

export default CatProfileForm;
