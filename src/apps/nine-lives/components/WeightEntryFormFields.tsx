import { useMemo } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import type { WeightEntry } from '@apps/nine-lives/types';

interface WeightEntryFormValues {
  catId?: string;
  weight: string;
  unit: string;
  measuredAt: string;
  linkedVisitId?: string | null;
}

interface WeightEntryFormFieldsProps {
  catName?: string;
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
  initialWeightEntry?: Partial<WeightEntry> | null;
  isSubmitting?: boolean;
  onSubmit: (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => Promise<void> | void;
  onDelete?: (weightEntryId: string) => Promise<void> | void;
  /** When provided, renders a Cancel button (for inline/non-modal usage). */
  onCancel?: () => void;
}

const { input, select } = FormFactories;

function WeightEntryFormFields({
  catName,
  catOptions,
  initialWeightEntry,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onCancel,
}: WeightEntryFormFieldsProps) {
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
        placeholder: initialWeightEntry?.weight?.toString() || '5.4',
        required: true,
        variant: 'outline',
      }),
      input({
        name: 'unit',
        label: 'Unit',
        placeholder: initialWeightEntry?.unit || 'lb',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'measuredAt',
        label: 'Measured date',
        required: true,
        variant: 'outline',
      }),
      // TODO: replace with a select populated from this cat's visits once visit records exist.
      input({
        name: 'linkedVisitId',
        label: 'Linked visit ID (optional)',
        placeholder: initialWeightEntry?.linkedVisitId || 'visit-id',
        variant: 'outline',
      }),
    ],
    [showCatField, catOptions, initialWeightEntry],
  );

  const handleSubmit = async (data: WeightEntryFormValues) => {
    const weight = Number(data.weight);
    const measuredAt = fromDateInputValue(data.measuredAt) ?? null;
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

  return (
    <Form
      key={formId}
      id={formId}
      form={fields}
      initialData={{
        catId: initialWeightEntry?.catId ?? '',
        weight: initialWeightEntry?.weight?.toString() ?? '',
        unit: initialWeightEntry?.unit ?? 'lb',
        measuredAt: toDateInputValue(initialWeightEntry?.measuredAt ?? undefined),
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
          <div className='flex items-center gap-2'>
            {onCancel && (
              <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save weight entry' : 'Add weight entry'}
            </Button>
          </div>
        </div>
      }
    />
  );
}

export default WeightEntryFormFields;
