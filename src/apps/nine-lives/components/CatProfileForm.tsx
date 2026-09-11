import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

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

const defaultLifestyle: CatLifestyle = 'indoor';

function toDateValue(value?: number) {
  if (!value || Number.isNaN(value)) {
    return '';
  }

  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

function fromDateValue(value: string) {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T00:00:00Z`).getTime();
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

function CatProfileForm({
  cat,
  householdId,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: CatProfileFormProps) {
  const [name, setName] = useState(cat?.name ?? '');
  const [breed, setBreed] = useState(cat?.breed ?? CAT_BREEDS[0]);
  const [dateOfBirth, setDateOfBirth] = useState(() => toDateValue(cat?.dateOfBirth));
  const [isDateOfBirthEstimated, setIsDateOfBirthEstimated] = useState(
    cat?.isDateOfBirthEstimated ?? false,
  );
  const [lifestyle, setLifestyle] = useState<CatLifestyle>(
    cat?.lifestyle ?? defaultLifestyle,
  );
  const [microchipNumber, setMicrochipNumber] = useState(cat?.microchipNumber ?? '');
  const [shelterName, setShelterName] = useState(cat?.shelterOrigin?.name ?? '');
  const [shelterAddress, setShelterAddress] = useState(
    cat?.shelterOrigin?.address ?? '',
  );
  const [adoptedAt, setAdoptedAt] = useState(() => toDateValue(cat?.adoptedAt));
  const [customKeyDates, setCustomKeyDates] = useState<CatKeyDate[]>(
    cat?.customKeyDates ?? [{ label: '', date: 0 }],
  );
  const [insuranceProvider, setInsuranceProvider] = useState(
    cat?.insurance?.provider ?? INSURANCE_PROVIDER_OPTIONS[0],
  );
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState(
    cat?.insurance?.policyNumber ?? '',
  );
  const [notes, setNotes] = useState(cat?.notes ?? '');

  const nextCatValue = useMemo(() => {
    const dateOfBirthMs = fromDateValue(dateOfBirth) ?? cat?.dateOfBirth ?? 0;
    const adoptedAtMs = fromDateValue(adoptedAt);
    const keyDates = customKeyDates
      .filter((entry) => entry.label.trim() && entry.date > 0)
      .map((entry) => ({ label: entry.label.trim(), date: entry.date }));
    const nextInsurance = buildCatInsurance(insuranceProvider, insurancePolicyNumber);

    return {
      id: cat?.id ?? '',
      householdId: householdId ?? cat?.householdId ?? 'new-household',
      name: name.trim(),
      breed: breed.trim() || CAT_BREEDS[0],
      dateOfBirth: dateOfBirthMs,
      isDateOfBirthEstimated,
      lifestyle,
      microchipNumber: microchipNumber.trim() || undefined,
      shelterOrigin:
        shelterName || shelterAddress
          ? {
              name: shelterName.trim() || 'Unknown shelter',
              address: shelterAddress.trim() || undefined,
            }
          : undefined,
      adoptedAt: adoptedAtMs,
      customKeyDates: keyDates.length > 0 ? keyDates : undefined,
      insurance: nextInsurance,
      notes: notes.trim() || undefined,
      createdBy: cat?.createdBy ?? 'current-user',
      createdAt: cat?.createdAt ?? 0,
      lastEditedAt: cat?.lastEditedAt ?? 0,
    } satisfies Cat;
  }, [
    adoptedAt,
    breed,
    cat,
    customKeyDates,
    dateOfBirth,
    householdId,
    insurancePolicyNumber,
    insuranceProvider,
    isDateOfBirthEstimated,
    lifestyle,
    microchipNumber,
    name,
    notes,
    shelterAddress,
    shelterName,
  ]);

  const handleSubmit = async () => {
    const preparedCat: Cat = {
      ...nextCatValue,
      createdAt: nextCatValue.createdAt || Date.now(),
      lastEditedAt: Date.now(),
    };

    await onSubmit(preparedCat);
  };

  const updateKeyDate = (index: number, nextValue: Partial<CatKeyDate>) => {
    setCustomKeyDates((current) =>
      current.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, ...nextValue } : entry,
      ),
    );
  };

  const addKeyDate = () => {
    setCustomKeyDates((current) => [...current, { label: '', date: 0 }]);
  };

  return (
    <form
      className='space-y-5 rounded-xl border border-border bg-card p-4'
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className='grid gap-4 md:grid-cols-2'>
        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
            placeholder='Mochi'
          />
        </label>

        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Breed</span>
          <select
            value={breed}
            onChange={(event) => setBreed(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
          >
            {CAT_BREEDS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Date of birth</span>
          <input
            type='date'
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
          />
        </label>

        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Lifestyle</span>
          <select
            value={lifestyle}
            onChange={(event) => setLifestyle(event.target.value as CatLifestyle)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
          >
            <option value='indoor'>Indoor</option>
            <option value='outdoor'>Outdoor</option>
            <option value='indoor_outdoor'>Indoor + outdoor</option>
          </select>
        </label>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            checked={isDateOfBirthEstimated}
            onChange={(event) => setIsDateOfBirthEstimated(event.target.checked)}
          />
          Date of birth is estimated
        </label>

        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Microchip</span>
          <input
            value={microchipNumber}
            onChange={(event) => setMicrochipNumber(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
            placeholder='Microchip number'
          />
        </label>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Shelter / origin</span>
          <input
            value={shelterName}
            onChange={(event) => setShelterName(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
            placeholder='Shelter name'
          />
        </label>

        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Shelter address</span>
          <input
            value={shelterAddress}
            onChange={(event) => setShelterAddress(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
            placeholder='Address'
          />
        </label>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Adoption date</span>
          <input
            type='date'
            value={adoptedAt}
            onChange={(event) => setAdoptedAt(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
          />
        </label>

        <label className='space-y-2 text-sm'>
          <span className='font-medium'>Insurance provider</span>
          <select
            value={insuranceProvider}
            onChange={(event) => setInsuranceProvider(event.target.value)}
            className='w-full rounded-md border border-border bg-background px-3 py-2'
          >
            {INSURANCE_PROVIDER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className='space-y-2 text-sm'>
        <span className='font-medium'>Insurance policy number</span>
        <input
          value={insurancePolicyNumber}
          onChange={(event) => setInsurancePolicyNumber(event.target.value)}
          className='w-full rounded-md border border-border bg-background px-3 py-2'
          placeholder='Policy number'
        />
      </label>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h3 className='font-medium'>Key dates</h3>
          <button
            type='button'
            onClick={addKeyDate}
            className='rounded-md border border-border px-2 py-1 text-sm'
          >
            Add date
          </button>
        </div>

        {customKeyDates.map((entry, index) => (
          <div key={`${entry.label}-${index}`} className='grid gap-3 md:grid-cols-2'>
            <input
              value={entry.label}
              onChange={(event) =>
                updateKeyDate(index, { label: event.target.value })
              }
              className='rounded-md border border-border bg-background px-3 py-2'
              placeholder='e.g. Spayed/neutered'
            />
            <input
              type='date'
              value={toDateValue(entry.date)}
              onChange={(event) =>
                updateKeyDate(index, {
                  date: fromDateValue(event.target.value) ?? 0,
                })
              }
              className='rounded-md border border-border bg-background px-3 py-2'
            />
          </div>
        ))}
      </div>

      <label className='block space-y-2 text-sm'>
        <span className='font-medium'>Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className='min-h-[100px] w-full rounded-md border border-border bg-background px-3 py-2'
          placeholder='Care notes, quirks, or anything relevant'
        />
      </label>

      <div className='flex justify-end gap-3'>
        {onCancel && (
          <Button type='button' variant='secondary' onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type='submit' disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? 'Saving…' : cat ? 'Save changes' : 'Create cat'}
        </Button>
      </div>
    </form>
  );
}

export default CatProfileForm;
