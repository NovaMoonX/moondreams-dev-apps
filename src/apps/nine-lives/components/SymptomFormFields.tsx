import { useMemo, useState } from 'react';

import { Badge, Button, Form, FormFactories, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';

import { createCustomSymptomQuickTag } from '../store/actions/customSymptomQuickTagsActions';
import { selectCustomSymptomQuickTagsByHousehold, selectVisitsByHousehold } from '../store/selectors';
import type { CatCondition, Symptom, SymptomQuickTag, SymptomSeverity } from '../types';
import { getVisitOptions } from '../utils/visitOptions';
import LinkedVisitsField from './LinkedVisitsField';

interface SymptomFormValues {
  catId?: string;
  description: string;
  quickTags: string[];
  firstNoticedAt: string;
  severity: string;
  linkedConditionId: string;
  linkedVisitIds: string[];
}

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

function QuickTagsField({
  value,
  onValueChange,
  options,
  disabled,
  onCustomTagAdded,
}: {
  value: string[];
  onValueChange: (value: string[]) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onCustomTagAdded: (label: string) => void;
}) {
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const toggleTag = (tagValue: string) => {
    onValueChange(value.includes(tagValue) ? value.filter((v) => v !== tagValue) : [...value, tagValue]);
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();

    if (!trimmed) {
      return;
    }

    const existingMatch = options.find((option) => option.label.toLowerCase() === trimmed.toLowerCase());

    if (!existingMatch) {
      onCustomTagAdded(trimmed);
    }

    const canonicalValue = existingMatch?.value ?? trimmed;

    if (!value.includes(canonicalValue)) {
      onValueChange([...value, canonicalValue]);
    }

    setCustomInput('');
    setIsAddingCustom(false);
  };

  return (
    <div className='space-y-2'>
      <div role='group' aria-label='Quick tags' className='flex flex-wrap gap-2'>
        {options.map((option) => {
          const isSelected = value.includes(option.value);

          return (
            <button
              key={option.value}
              type='button'
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => toggleTag(option.value)}
            >
              <Badge variant={isSelected ? 'primary' : 'muted'} outline={!isSelected}>
                {option.label}
              </Badge>
            </button>
          );
        })}
      </div>
      {isAddingCustom ? (
        <div className='flex items-center gap-2'>
          <Input
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder='Custom tag'
            variant='outline'
            disabled={disabled}
            autoFocus
          />
          <Button type='button' size='sm' onClick={handleAddCustom} disabled={disabled}>
            Add
          </Button>
        </div>
      ) : (
        <Button
          type='button'
          variant='link'
          size='sm'
          className={join('text-xs', mutedLinkClassName)}
          onClick={() => setIsAddingCustom(true)}
          disabled={disabled}
        >
          + Add a custom tag
        </Button>
      )}
    </div>
  );
}

interface SymptomFormFieldsProps {
  householdId?: string;
  conditions: CatCondition[];
  /** When provided, renders a required "Cat" selector as the first field so the form isn't tied to one cat. */
  catOptions?: { label: string; value: string }[];
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

const { textarea, custom, select } = FormFactories;

function SymptomFormFields({
  householdId,
  conditions,
  catOptions,
  initialSymptom,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onCancel,
}: SymptomFormFieldsProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const customQuickTags = useAppSelector(selectCustomSymptomQuickTagsByHousehold(householdId), shallowEqual);
  const isEditing = Boolean(initialSymptom?.id);
  const formId = initialSymptom?.id ?? 'new-nine-lives-symptom';
  const showCatField = Boolean(catOptions && catOptions.length > 0);

  const [pendingNewTagLabels, setPendingNewTagLabels] = useState<string[]>([]);

  const visitOptions = useMemo(() => getVisitOptions(visits), [visits]);

  const quickTagOptions = useMemo(
    () => [
      ...QUICK_TAG_OPTIONS.map((option) => ({ value: option.value as string, label: option.label })),
      ...customQuickTags.map((tag) => ({ value: tag.label, label: tag.label })),
      ...pendingNewTagLabels
        .filter((label) => !customQuickTags.some((tag) => tag.label.toLowerCase() === label.toLowerCase()))
        .map((label) => ({ value: label, label })),
    ],
    [customQuickTags, pendingNewTagLabels],
  );

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
      custom({
        name: 'quickTags',
        label: 'Quick tags',
        renderComponent: (props) => (
          <QuickTagsField
            value={props.value as string[]}
            onValueChange={props.onValueChange}
            options={quickTagOptions}
            disabled={props.disabled}
            onCustomTagAdded={(label) =>
              setPendingNewTagLabels((current) =>
                current.some((existing) => existing.toLowerCase() === label.toLowerCase())
                  ? current
                  : [...current, label],
              )
            }
          />
        ),
        colSpan: 'full',
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
      ...(visitOptions.length > 0
        ? [
            custom({
              name: 'linkedVisitIds',
              label: 'Linked visits',
              renderComponent: (props) => (
                <LinkedVisitsField
                  value={props.value as string[]}
                  onValueChange={props.onValueChange}
                  visitOptions={visitOptions}
                  disabled={props.disabled}
                />
              ),
              colSpan: 'full',
            }),
          ]
        : []),
    ],
    [showCatField, catOptions, conditions, visitOptions, quickTagOptions],
  );

  const handleSubmit = async (data: SymptomFormValues) => {
    const firstNoticedAt = fromDateInputValue(data.firstNoticedAt) ?? null;

    if (firstNoticedAt === null || (showCatField && !data.catId)) {
      return;
    }

    const usedPendingLabels = pendingNewTagLabels.filter((label) => data.quickTags.includes(label));

    if (usedPendingLabels.length > 0 && householdId && user?.uid) {
      await Promise.all(
        usedPendingLabels.map((label) =>
          dispatch(createCustomSymptomQuickTag({ householdId, uid: user.uid, label })).unwrap(),
        ),
      );
    }

    await onSubmit({
      id: initialSymptom?.id,
      catId: data.catId || initialSymptom?.catId,
      description: data.description.trim(),
      quickTags: data.quickTags,
      firstNoticedAt,
      severity: (data.severity || null) as SymptomSeverity | null,
      linkedConditionId: data.linkedConditionId || null,
      linkedVisitIds: data.linkedVisitIds ?? [],
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
        catId: initialSymptom?.catId ?? '',
        description: initialSymptom?.description ?? '',
        quickTags: initialSymptom?.quickTags ?? [],
        firstNoticedAt: toDateInputValue(initialSymptom?.firstNoticedAt ?? undefined),
        severity: initialSymptom?.severity ?? '',
        linkedConditionId: initialSymptom?.linkedConditionId ?? '',
        linkedVisitIds: initialSymptom?.linkedVisitIds ?? [],
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
