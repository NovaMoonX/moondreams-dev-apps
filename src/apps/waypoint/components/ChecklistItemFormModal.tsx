import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_CATEGORY_LABELS,
} from '@apps/waypoint/constants';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { ChecklistCategory, ChecklistItem, TripSpace } from '@apps/waypoint/types';

interface ChecklistFormData {
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string;
  completeByDayIndex: string;
  note: string;
  assignedToUids: string[];
}

interface ChecklistItemFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  memberOptions: { label: string; value: string }[];
  item?: ChecklistItem | null;
  isSubmitting?: boolean;
  onSubmit: (values: {
    title: string;
    category: ChecklistCategory;
    customCategoryLabel: string | null;
    completeByDayIndex: number | null;
    note: string | null;
    assignedToUids: string[];
  }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, select, checkboxGroup } = FormFactories;

function getInitialFormData(item?: ChecklistItem | null): ChecklistFormData {
  return {
    title: item?.title ?? '',
    category: item?.category ?? 'DOCUMENTS',
    customCategoryLabel: item?.customCategoryLabel ?? '',
    completeByDayIndex:
      item?.completeByDayIndex === null || item?.completeByDayIndex === undefined
        ? ''
        : String(item.completeByDayIndex),
    note: item?.note ?? '',
    assignedToUids: item?.assignedToUids ?? [],
  };
}

export default function ChecklistItemFormModal({
  isOpen,
  trip,
  memberOptions,
  item = null,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ChecklistItemFormModalProps) {
  const { confirm } = useActionModal();
  const initialData = useMemo(() => getInitialFormData(item), [item]);
  const [formData, setFormData] = useState<ChecklistFormData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [showNoteField, setShowNoteField] = useState(Boolean(item?.note));

  const isFormComplete =
    formData.title.trim() !== '' &&
    (formData.category !== 'OTHER' || formData.customCategoryLabel.trim() !== '');

  const dayOptions = useMemo(
    () => [
      { value: '', label: 'No specific day' },
      ...Array.from({ length: getDayCount(trip.startDate, trip.endDate) }, (_, index) => ({
        value: String(index),
        label: getDayLabel(trip.startDate, index),
      })),
    ],
    [trip.startDate, trip.endDate],
  );

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      input({
        name: 'title',
        label: 'Task',
        placeholder: 'Confirm passport expiration dates',
        variant: 'outline',
        required: true,
      }),
      select({
        name: 'category',
        label: 'Category',
        options: CHECKLIST_CATEGORIES.map((category) => ({
          label: CHECKLIST_CATEGORY_LABELS[category],
          value: category,
        })),
        required: true,
      }),
    ];

    if (formData.category === 'OTHER') {
      nextFields.push(
        input({
          name: 'customCategoryLabel',
          label: 'Custom category label',
          placeholder: 'Health & safety',
          variant: 'outline',
          required: true,
        }),
      );
    }

    nextFields.push(
      select({
        name: 'completeByDayIndex',
        label: 'Complete by',
        options: dayOptions,
      }),
    );

    nextFields.push(
      checkboxGroup({
        name: 'assignedToUids',
        label: 'Assign to',
        description: 'Leave empty if everyone should own this task.',
        options: memberOptions,
      }),
    );

    nextFields.push(
      custom({
        name: 'note',
        label: 'Note',
        renderComponent: (props) =>
          showNoteField ? (
            <Textarea
              rows={2}
              value={props.value as string}
              onChange={(event) => props.onValueChange(event.target.value)}
              variant='outline'
              placeholder='Anything worth remembering about this task'
            />
          ) : (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0'
              onClick={() => setShowNoteField(true)}
            >
              + Add note
            </Button>
          ),
      }),
    );

    return nextFields;
  }, [dayOptions, formData.category, memberOptions, showNoteField]);

  const handleSubmit = async (data: ChecklistFormData) => {
    const title = data.title.trim();
    const customCategoryLabel =
      data.category === 'OTHER' ? data.customCategoryLabel.trim() : null;

    if (!title || (data.category === 'OTHER' && !customCategoryLabel)) {
      setError('Enter a task and a custom category label when using Other.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title,
        category: data.category,
        customCategoryLabel,
        completeByDayIndex: data.completeByDayIndex === '' ? null : Number(data.completeByDayIndex),
        note: data.note.trim() || null,
        assignedToUids: data.assignedToUids,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save checklist item.',
      );
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete checklist item',
      message: `Delete "${item?.title}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await onDelete();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Checklist item'>
      <Form
        id='waypoint-checklist-item'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as ChecklistFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as ChecklistFormData);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={
              item &&
              onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
            }
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  {isSubmitting ? 'Saving…' : item ? 'Save changes' : 'Add item'}
                </Button>
              </>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}
