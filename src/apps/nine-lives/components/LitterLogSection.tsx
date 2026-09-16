import { useMemo, useState } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import { formatDateTime } from '@/utils/formatUtils';
import { LITTER_TYPE_OPTIONS } from '@apps/nine-lives/constants/presetOptions';
import {
  createLitterEntry,
  deleteLitterEntry,
  updateLitterEntry,
} from '@apps/nine-lives/store/actions/litterEntriesActions';
import { selectLitterEntriesByHousehold } from '@apps/nine-lives/store/selectors';
import type { LitterEntry, LitterType } from '@apps/nine-lives/types';

import DetailsDisclosure from './DetailsDisclosure';

interface LitterEntryFormValues {
  litterBoxName: string;
  litterType: string;
  customLitterType?: string;
  weight: string;
  weightUnit: string;
  cost?: string;
  loggedAt: string;
  changedAt?: string;
  notes?: string;
}

interface LitterEntryFormProps {
  initialEntry?: LitterEntry | null;
  isSubmitting: boolean;
  onSubmit: (entry: Partial<LitterEntry>) => Promise<void> | void;
  onDelete?: (entryId: string) => Promise<void> | void;
  onCancel: () => void;
}

const { input, select, textarea } = FormFactories;

const litterTypeLabels: Record<LitterType, string> = {
  clumping_clay: 'Clumping clay',
  non_clumping_clay: 'Non-clumping clay',
  pine_wood_pellet: 'Pine / wood pellet',
  paper: 'Paper',
  crystal_silica: 'Crystal / silica',
  corn: 'Corn',
  wheat: 'Wheat',
  walnut: 'Walnut',
  custom: 'Custom',
};

const unitOptions = [
  { label: 'Pounds (lb)', value: 'lb' },
  { label: 'Kilograms (kg)', value: 'kg' },
];

function formatWeight(weight: number, unit: LitterEntry['weightUnit']) {
  return `${weight.toFixed(2)} ${unit}`;
}

function convertWeight(
  weight: number,
  fromUnit: LitterEntry['weightUnit'],
  toUnit: LitterEntry['weightUnit'],
) {
  if (fromUnit === toUnit) {
    return weight;
  }

  return fromUnit === 'kg' ? weight * 2.20462 : weight / 2.20462;
}

function getDaysSince(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  return Math.max(0, days);
}

function LitterEntryForm({
  initialEntry,
  isSubmitting,
  onSubmit,
  onDelete,
  onCancel,
}: LitterEntryFormProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialEntry?.id);
  const formId = initialEntry?.id ?? 'new-nine-lives-litter-entry';
  const [litterType, setLitterType] = useState<LitterType>(initialEntry?.litterType ?? 'clumping_clay');
  const [isValid, setIsValid] = useState(
    Boolean(initialEntry?.litterBoxName && initialEntry.weight > 0 && initialEntry.loggedAt),
  );

  const litterTypeOptions = useMemo(
    () =>
      LITTER_TYPE_OPTIONS.map((value) => ({
        label: litterTypeLabels[value],
        value,
      })),
    [],
  );

  const fields = useMemo(
    () => [
      input({
        name: 'litterBoxName',
        label: 'Litter box',
        placeholder: 'Main litter box',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'litterType',
        label: 'Litter type',
        options: litterTypeOptions,
      }),
      ...(litterType === 'custom'
        ? [
            input({
              name: 'customLitterType',
              label: 'Custom litter type',
              placeholder: 'Describe the litter',
              required: true,
              variant: 'outline',
            }),
          ]
        : []),
      input({
        name: 'weight',
        label: 'Litter weight',
        type: 'number',
        placeholder: '10',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'weightUnit',
        label: 'Weight unit',
        options: unitOptions,
      }),
      input({
        name: 'cost',
        label: 'Cost (optional)',
        type: 'number',
        placeholder: '24.99',
        variant: 'outline',
      }),
      createDateInputField({
        name: 'loggedAt',
        label: 'Weigh-in date',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'changedAt',
        label: 'Litter box changed on (optional)',
        variant: 'outline',
      }),
      textarea({
        name: 'notes',
        label: 'Notes (optional)',
        placeholder: 'Refill, cleanup, or other context',
        rows: 3,
        variant: 'outline',
      }),
    ],
    [litterType, litterTypeOptions],
  );

  const handleSubmit = async (data: LitterEntryFormValues) => {
    const litterBoxName = data.litterBoxName.trim();
    const weight = Number(data.weight);
    const loggedAt = fromDateInputValue(data.loggedAt);
    const changedAt = data.changedAt ? fromDateInputValue(data.changedAt) ?? null : null;
    const customLitterType = data.customLitterType?.trim() || null;
    const cost = data.cost?.trim() ? Number(data.cost) : null;

    if (
      !litterBoxName ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      loggedAt === undefined ||
      data.litterType === 'custom' && !customLitterType ||
      cost !== null && (!Number.isFinite(cost) || cost < 0)
    ) {
      return;
    }

    await onSubmit({
      id: initialEntry?.id,
      litterBoxName,
      litterType: data.litterType as LitterType,
      customLitterType,
      weight,
      weightUnit: data.weightUnit === 'kg' ? 'kg' : 'lb',
      cost,
      loggedAt,
      changedAt,
      notes: data.notes?.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialEntry?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete litter entry',
      message: 'Are you sure you want to delete this litter weigh-in?',
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialEntry.id);
    }
  };

  return (
    <Form
      key={formId}
      id={formId}
      form={fields}
      initialData={{
        litterBoxName: initialEntry?.litterBoxName ?? 'Main litter box',
        litterType: initialEntry?.litterType ?? 'clumping_clay',
        customLitterType: initialEntry?.customLitterType ?? '',
        weight: initialEntry?.weight?.toString() ?? '',
        weightUnit: initialEntry?.weightUnit ?? 'lb',
        cost: initialEntry?.cost?.toString() ?? '',
        loggedAt: toDateInputValue(initialEntry?.loggedAt),
        changedAt: toDateInputValue(initialEntry?.changedAt ?? undefined),
        notes: initialEntry?.notes ?? '',
      }}
      columns={1}
      spacing='normal'
      onDataChange={(data) => {
        const values = data as LitterEntryFormValues;
        const nextType = values.litterType as LitterType;

        if (nextType !== litterType) {
          setLitterType(nextType);
        }

        const nextCost = values.cost?.trim() ? Number(values.cost) : null;
        setIsValid(
          Boolean(
            values.litterBoxName?.trim() &&
              Number.isFinite(Number(values.weight)) &&
              Number(values.weight) > 0 &&
              values.loggedAt &&
              (nextType !== 'custom' || values.customLitterType?.trim()) &&
              (nextCost === null || (Number.isFinite(nextCost) && nextCost >= 0)),
          ),
        );
      }}
      onSubmit={(data) => {
        void handleSubmit(data as LitterEntryFormValues);
      }}
      submitButton={
        <div className='flex items-center justify-between gap-2'>
          <div>
            {isEditing && onDelete && (
              <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                Delete
              </Button>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type='submit' loading={isSubmitting} disabled={!isValid}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save litter entry' : 'Log litter weigh-in'}
            </Button>
          </div>
        </div>
      }
    />
  );
}

interface LitterLogSectionProps {
  householdId: string;
}

function LitterLogSection({ householdId }: LitterLogSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(selectLitterEntriesByHousehold(householdId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LitterEntry | null>(null);

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => left.loggedAt - right.loggedAt),
    [entries],
  );

  const latestChangeByBox = useMemo(() => {
    const latest = new Map<string, number>();

    entries.forEach((entry) => {
      if (entry.changedAt !== null && (latest.get(entry.litterBoxName) ?? 0) < entry.changedAt) {
        latest.set(entry.litterBoxName, entry.changedAt);
      }
    });

    return [...latest.entries()];
  }, [entries]);

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEntry(null);
  };

  const handleSubmit = async (entry: Partial<LitterEntry>) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingEntry) {
        await dispatch(
          updateLitterEntry({
            householdId,
            entryId: editingEntry.id,
            changes: entry,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createLitterEntry({
            householdId,
            uid: user.uid,
            litterEntry: entry as Partial<LitterEntry> &
              Pick<LitterEntry, 'litterBoxName' | 'litterType' | 'weight' | 'weightUnit' | 'loggedAt'>,
          }),
        ).unwrap();
      }
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteLitterEntry({ householdId, entryId })).unwrap();
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <DetailsDisclosure label='Litter usage'>
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2 pb-2'>
            <small className='text-muted-foreground text-sm'>
              Weigh litter over time to see usage and time since each box was changed.
            </small>
            <Button
              type='button'
              size='sm'
              onClick={() => {
                setEditingEntry(null);
                setIsFormOpen(true);
              }}
            >
              Log weigh-in
            </Button>
          </div>

          {latestChangeByBox.length > 0 && (
            <div className='text-muted-foreground space-y-1 text-sm'>
              <strong className='text-foreground'>Litter box changes</strong>
              {latestChangeByBox.map(([boxName, changedAt]) => {
                const days = getDaysSince(changedAt);
                return (
                  <div key={boxName}>
                    {boxName}: {days === 0 ? 'changed today' : `${days} day${days === 1 ? '' : 's'} since changed`}
                  </div>
                );
              })}
            </div>
          )}

          {sortedEntries.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No litter weigh-ins logged yet.</p>
          ) : (
            <div className='divide-border divide-y'>
              {sortedEntries.map((entry, index) => {
                const previous = sortedEntries[index - 1];
                const usage = previous
                  ? convertWeight(previous.weight, previous.weightUnit, entry.weightUnit) - entry.weight
                  : null;

                return (
                  <div key={entry.id} className='flex items-start justify-between gap-3 py-3 first:pt-0'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                        <strong className='text-sm'>{formatWeight(entry.weight, entry.weightUnit)}</strong>
                        <span className='text-muted-foreground text-sm'>{entry.litterBoxName}</span>
                      </div>
                      <div className='text-muted-foreground text-sm'>
                        {litterTypeLabels[entry.litterType] === 'Custom'
                          ? entry.customLitterType
                          : litterTypeLabels[entry.litterType]}
                        {' · '}
                        {formatDateTime(entry.loggedAt)}
                      </div>
                      {usage !== null && (
                        <div className='text-sm'>
                          {usage >= 0
                            ? `${formatWeight(usage, entry.weightUnit)} used since previous weigh-in`
                            : `${formatWeight(Math.abs(usage), entry.weightUnit)} added since previous weigh-in`}
                        </div>
                      )}
                      {entry.changedAt !== null && (
                        <div className='text-muted-foreground text-sm'>
                          Box changed: {formatDateTime(entry.changedAt)} ({getDaysSince(entry.changedAt)} days ago)
                        </div>
                      )}
                      {entry.cost !== null && <div className='text-muted-foreground text-sm'>Cost: ${entry.cost.toFixed(2)}</div>}
                      {entry.notes && <div className='text-muted-foreground text-sm'>{entry.notes}</div>}
                    </div>
                    <Button type='button' variant='link' size='sm' onClick={() => {
                      setEditingEntry(entry);
                      setIsFormOpen(true);
                    }}>
                      Edit
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DetailsDisclosure>

      {isFormOpen && (
        <div className='mt-4'>
          <LitterEntryForm
            key={editingEntry?.id ?? 'new'}
            initialEntry={editingEntry}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onDelete={editingEntry ? handleDelete : undefined}
            onCancel={closeForm}
          />
        </div>
      )}
    </section>
  );
}

export default LitterLogSection;
