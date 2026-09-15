import { useMemo } from 'react';

import { Button, Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';

import type { CatCondition, Symptom, SymptomQuickTag, SymptomSeverity } from '../types';

interface SymptomFormValues {
  description: string;
  quickTags: SymptomQuickTag[];
  firstNoticedAt: string;
  severity: string;
  linkedConditionId: string;
}

interface SymptomFormFieldsProps {
  conditions: CatCondition[];
  initialSymptom?: Partial<Symptom> | null;
  isSubmitting?: boolean;
  onSubmit: (symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>) => Promise<void> | void;
  onDelete?: (symptomId: string) => Promise<void> | void;
  onCancel?: () => void;
}

const QUICK_TAG_OPTIONS: Array<{ value: SymptomQuickTag; label: string }> = [
  { value: 'litter_box_change', label: 'Litter box change' },
  { value: 'appetite_change', label: 'Appetite change' },
  { value: 'hiding', label: 'Hiding' },
  { value: 'playfulness_change', label: 'Playfulness change' },
  { value: 'grooming_change', label: 'Grooming change' },
  { value: 'vomiting', label: 'Vomiting' },
  { value: 'lethargy', label: 'Lethargy' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_OPTIONS: Array<{ value: SymptomSeverity; label: string }> = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

const { textarea, checkboxGroup, select } = FormFactories;

function SymptomFormFields({
  conditions,
  initialSymptom,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onCancel,
}: SymptomFormFieldsProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialSymptom?.id);
  const formId = initialSymptom?.id ?? 'new-nine-lives-symptom';

  const fields = useMemo(
    () => [
      checkboxGroup({
        name: 'quickTags',
        label: 'Quick tags',
        options: QUICK_TAG_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      }),
      textarea({
        name: 'description',
        label: 'Description',
        placeholder: 'Describe what changed, when you noticed it, or anything else the vet should know.',
        rows: 3,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'firstNoticedAt',
        label: 'First noticed',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'severity',
        label: 'Severity',
        placeholder: 'Not specified',
        clearable: true,
        options: SEVERITY_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      }),
      ...(conditions.length > 0
        ? [
            select({
              name: 'linkedConditionId',
              label: 'Linked condition',
              placeholder: 'None',
              clearable: true,
              options: conditions.map((condition) => ({ value: condition.id, label: condition.name })),
            }),
          ]
        : []),
    ],
    [conditions],
  );

  const handleSubmit = async (data: SymptomFormValues) => {
    const firstNoticedAt = fromDateInputValue(data.firstNoticedAt) ?? null;

    if (firstNoticedAt === null) {
      return;
    }

    await onSubmit({
      id: initialSymptom?.id,
      description: data.description.trim(),
      quickTags: data.quickTags,
      firstNoticedAt,
      severity: (data.severity || null) as SymptomSeverity | null,
      linkedConditionId: data.linkedConditionId || null,
    });
  };

  const handleDelete = async () => {
    if (!initialSymptom?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete symptom',
      message: 'Are you sure you want to delete this symptom entry?',
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialSymptom.id);
    }
  };

  return (
    <Form
      id={formId}
      form={fields}
      initialData={{
        description: initialSymptom?.description ?? '',
        quickTags: initialSymptom?.quickTags ?? [],
        firstNoticedAt: toDateInputValue(initialSymptom?.firstNoticedAt ?? undefined),
        severity: initialSymptom?.severity ?? '',
        linkedConditionId: initialSymptom?.linkedConditionId ?? '',
      }}
      columns={1}
      onSubmit={(data) => {
        void handleSubmit(data as SymptomFormValues);
      }}
      submitButton={
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            {isEditing && onDelete && (
              <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
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
              {isSubmitting ? 'Saving…' : isEditing ? 'Save symptom' : 'Add symptom'}
            </Button>
          </div>
        </div>
      }
    />
  );
}

export default SymptomFormFields;
