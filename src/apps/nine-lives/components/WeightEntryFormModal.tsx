import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import type { WeightEntry } from '@apps/nine-lives/types';

interface WeightEntryFormValues {
  catId?: string;
  weight: string;
  unit: string;
  measuredAt: string;
  linkedVisitId?: string | null;
}

interface WeightEntryFormModalProps {
  isOpen: boolean;
  catName?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialWeightEntry?: Partial<WeightEntry> | null;
  isSubmitting?: boolean;
  onSubmit: (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => Promise<void> | void;
  onDelete?: (weightEntryId: string) => Promise<void> | void;
  onClose: () => void;
}

const { input, select } = FormFactories;

function WeightEntryFormModal({
  isOpen,
  catName,
  catOptions,
  initialWeightEntry,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: WeightEntryFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialWeightEntry?.id);
  const formId = initialWeightEntry?.id ?? 'new-nine-lives-weight-entry';
  const showCatField = Boolean(catOptions && catOptions.length > 0);

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
        name: 'weight',
        label: 'Weight',
        placeholder: '5.4',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'unit',
        label: 'Unit',
        placeholder: 'lb',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'measuredAt',
        label: 'Measured date',
        placeholder: '2025-03-10',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'linkedVisitId',
        label: 'Linked visit ID (optional)',
        placeholder: 'visit-id',
        variant: 'outline',
      }),
    ],
    [showCatField, catOptions],
  );

  const toTimestamp = (value: string | null | undefined) => {
    if (!value) {
      return null;
    }

    const parsed = new Date(`${value}T12:00:00`).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleSubmit = async (data: WeightEntryFormValues) => {
    const weight = Number(data.weight);
    const measuredAt = toTimestamp(data.measuredAt);
    const normalizedUnit = data.unit.trim().toLowerCase() === 'kg' ? 'kg' : 'lb';

    if (!Number.isFinite(weight) || weight <= 0 || measuredAt === null || (showCatField && !data.catId)) {
      return;
    }

    await onSubmit({
      id: initialWeightEntry?.id,
      catId: data.catId || initialWeightEntry?.catId,
      weight,
      unit: normalizedUnit,
      measuredAt,
      linkedVisitId: data.linkedVisitId?.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialWeightEntry?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete weight entry',
      message: `Are you sure you want to delete this weight entry for ${catName ?? 'this cat'}?`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialWeightEntry.id);
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
      title={isEditing ? 'Edit weight entry' : `Add weight entry${catName ? ` for ${catName}` : ''}`}
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          catId: initialWeightEntry?.catId ?? '',
          weight: initialWeightEntry?.weight?.toString() ?? '',
          unit: initialWeightEntry?.unit ?? 'lb',
          measuredAt: defaultDate(initialWeightEntry?.measuredAt ?? null),
          linkedVisitId: initialWeightEntry?.linkedVisitId ?? '',
        }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as WeightEntryFormValues);
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
              {isSubmitting ? 'Saving…' : isEditing ? 'Save weight entry' : 'Add weight entry'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default WeightEntryFormModal;
