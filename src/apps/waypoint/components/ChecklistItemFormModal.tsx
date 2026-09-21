import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';

import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_CATEGORY_LABELS,
} from '@apps/waypoint/constants';
import type { ChecklistCategory } from '@apps/waypoint/types';

interface ChecklistFormData {
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string;
  assignedToUids: string[];
}

interface ChecklistItemFormModalProps {
  isOpen: boolean;
  memberOptions: { label: string; value: string }[];
  isSubmitting?: boolean;
  onSubmit: (values: {
    title: string;
    category: ChecklistCategory;
    customCategoryLabel: string | null;
    assignedToUids: string[];
  }) => Promise<void> | void;
  onClose: () => void;
}

const { input, select, checkboxGroup } = FormFactories;

const INITIAL_FORM_DATA: ChecklistFormData = {
  title: '',
  category: 'DOCUMENTS',
  customCategoryLabel: '',
  assignedToUids: [],
};

export default function ChecklistItemFormModal({
  isOpen,
  memberOptions,
  isSubmitting = false,
  onSubmit,
  onClose,
}: ChecklistItemFormModalProps) {
  const [formData, setFormData] = useState<ChecklistFormData>(INITIAL_FORM_DATA);
  const [error, setError] = useState<string | null>(null);

  const isFormComplete =
    formData.title.trim() !== '' &&
    (formData.category !== 'OTHER' || formData.customCategoryLabel.trim() !== '');

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
      checkboxGroup({
        name: 'assignedToUids',
        label: 'Assign to',
        description: 'Leave empty if everyone should own this task.',
        options: memberOptions,
      }),
    );

    return nextFields;
  }, [formData.category, memberOptions]);

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
        assignedToUids: data.assignedToUids,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to add checklist item.',
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Add checklist item'>
      <Form
        id='waypoint-checklist-item'
        form={fields}
        initialData={INITIAL_FORM_DATA}
        columns={1}
        onDataChange={(data) => setFormData(data as ChecklistFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as ChecklistFormData);
        }}
        submitButton={
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button
              type='submit'
              loading={isSubmitting}
              disabled={isSubmitting || !isFormComplete}
            >
              {isSubmitting ? 'Adding…' : 'Add item'}
            </Button>
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}
