import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Label,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, StickyNote } from 'lucide-react';
import { Input } from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount, getDayInputValue } from '@/utils/dateRangeUtils';
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_CATEGORY_EMOJIS,
  CHECKLIST_CATEGORY_LABELS,
} from '@apps/waypoint/constants';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import type { ChecklistCategory, ChecklistItem, TripSpace } from '@apps/waypoint/types';

interface ChecklistFormData {
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string;
  /** A calendar day, turned into a day number from the trip's start on save, so it stays relative. */
  dueDate: { enabled: boolean; date: string };
  note: string;
  assignedToUids: string[];
}

export interface ChecklistPrefill {
  category: ChecklistCategory;
  completeByDayIndex: number | null;
}

export interface ChecklistSubmitValues {
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null;
  completeByDayIndex: number | null;
  note: string | null;
  assignedToUids: string[];
}

interface ChecklistItemFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  memberOptions: { label: string; value: string }[];
  item?: ChecklistItem | null;
  prefill?: ChecklistPrefill;
  isSubmitting?: boolean;
  onSubmit: (values: ChecklistSubmitValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

const DAY_MS = 86_400_000;

function getDayIndexFromDate(trip: TripSpace, date: string) {
  const parsed = fromDateInputValue(date);
  return parsed === undefined ? null : Math.round((parsed - trip.startDate) / DAY_MS);
}

/** How far a due day sits from the trip, in words — it is stored as that distance, so it moves with the trip. */
function describeDueDay(trip: TripSpace, dayIndex: number) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const plural = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;
  if (dayIndex < 0) {
    return `${plural(-dayIndex)} before the trip starts`;
  }
  if (dayIndex >= dayCount) {
    return `${plural(dayIndex - dayCount + 1)} after the trip ends`;
  }
  return `Day ${dayIndex + 1} of the trip`;
}

function getInitialFormData(
  trip: TripSpace,
  item?: ChecklistItem | null,
  prefill?: ChecklistPrefill,
): ChecklistFormData {
  const dueDayIndex = item ? item.completeByDayIndex : (prefill?.completeByDayIndex ?? null);
  return {
    title: item?.title ?? '',
    category: item?.category ?? prefill?.category ?? 'DOCUMENTS',
    customCategoryLabel: item?.customCategoryLabel ?? '',
    dueDate:
      dueDayIndex === null
        ? { enabled: false, date: getDayInputValue(trip.startDate, 0) }
        : { enabled: true, date: getDayInputValue(trip.startDate, dueDayIndex) },
    note: item?.note ?? '',
    assignedToUids: item?.assignedToUids ?? [],
  };
}

export default function ChecklistItemFormModal({
  isOpen,
  trip,
  memberOptions,
  item = null,
  prefill,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ChecklistItemFormModalProps) {
  const { confirm } = useActionModal();
  const initialData = useMemo(() => getInitialFormData(trip, item, prefill), [trip, item, prefill]);
  const [formData, setFormData] = useState<ChecklistFormData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [showNoteField, setShowNoteField] = useState(Boolean(item?.note));
  const [isPicking, setIsPicking] = useState((item?.assignedToUids.length ?? 0) > 0);
  // The form reads its data once, so a change made from outside it remounts it.
  const [formKey, setFormKey] = useState(0);
  const resetField = (patch: Partial<ChecklistFormData>) => {
    setFormData((current) => ({ ...current, ...patch }));
    setFormKey((key) => key + 1);
  };

  const isFormComplete =
    formData.title.trim() !== '' &&
    (formData.category !== 'OTHER' || formData.customCategoryLabel.trim() !== '') &&
    (!formData.dueDate.enabled || getDayIndexFromDate(trip, formData.dueDate.date) !== null);

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      input({
        name: 'title',
        label: 'Task',
        placeholder: 'Confirm passport expiration dates',
        variant: 'outline',
      }),
      custom({
        name: 'category',
        label: 'Category',
        renderComponent: (props) => (
          <PillGroup
            label='Category'
            options={CHECKLIST_CATEGORIES.map((category) => ({
              value: category,
              label: CHECKLIST_CATEGORY_LABELS[category],
              emoji: CHECKLIST_CATEGORY_EMOJIS[category],
            }))}
            value={props.value as ChecklistCategory}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
    ];

    if (formData.category === 'OTHER') {
      nextFields.push(
        input({
          name: 'customCategoryLabel',
          label: 'Custom category label',
          placeholder: 'Health & safety',
          variant: 'outline',
          }),
      );
    }

    nextFields.push(
      custom({
        name: 'assignedToUids',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-2'>
            <Label>Who&apos;s on it?</Label>
            <PillGroup
              label="Who's on it"
              options={[
                { value: 'everyone', label: 'Everyone', emoji: '👥' },
                { value: 'pick', label: 'Pick people', emoji: '🎯' },
              ]}
              value={isPicking ? 'pick' : 'everyone'}
              onChange={(value) => {
                setIsPicking(value === 'pick');
                if (value === 'everyone') {
                  props.onValueChange([]);
                }
              }}
            />
            {isPicking && (
              <MultiPillGroup
                label='People'
                options={memberOptions}
                values={props.value as string[]}
                onChange={(next) => props.onValueChange(next)}
              />
            )}
          </div>
        ),
      }),
    );

    if (formData.dueDate.enabled) {
      nextFields.push(
        custom({
          name: 'dueDate',
          label: '',
          renderComponent: (props) => {
            const due = props.value as ChecklistFormData['dueDate'];
            const dayIndex = getDayIndexFromDate(trip, due.date);
            return (
              <RemovableField
                label='Complete by'
                removeLabel='Remove date'
                onRemove={() => resetField({ dueDate: { ...due, enabled: false } })}
              >
                <Input
                  type='date'
                  variant='outline'
                  aria-label='Due date'
                  value={due.date}
                  onChange={(event) => props.onValueChange({ ...due, date: event.target.value })}
                />
                {dayIndex !== null && (
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {describeDueDay(trip, dayIndex)}. It stays that far from the trip if the trip&apos;s dates move.
                  </p>
                )}
              </RemovableField>
            );
          },
        }),
      );
    }

    if (showNoteField) {
      nextFields.push(
        custom({
          name: 'note',
          label: '',
          renderComponent: (props) => (
            <RemovableField label='Note' removeLabel='Remove note' onRemove={() => setShowNoteField(false)}>
              <Textarea
                rows={2}
                value={props.value as string}
                onChange={(event) => props.onValueChange(event.target.value)}
                variant='outline'
                placeholder='Anything worth remembering about this task'
              />
            </RemovableField>
          ),
        }),
      );
    }

    return nextFields;
  }, [trip, formData.category, formData.dueDate.enabled, isPicking, memberOptions, showNoteField]);

  const handleSubmit = async (data: ChecklistFormData) => {
    const title = data.title.trim();
    const customCategoryLabel =
      data.category === 'OTHER' ? data.customCategoryLabel.trim() : null;

    if (!title || (data.category === 'OTHER' && !customCategoryLabel)) {
      setError('Enter a task and a custom category label when using Other.');
      return;
    }

    const completeByDayIndex = data.dueDate.enabled ? getDayIndexFromDate(trip, data.dueDate.date) : null;
    if (data.dueDate.enabled && completeByDayIndex === null) {
      setError('Pick a valid due date, or choose No date.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title,
        category: data.category,
        customCategoryLabel,
        completeByDayIndex,
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
    <FormSheet isOpen={isOpen} onClose={onClose} title='Checklist item'>
      <Form
        key={formKey}
        id='waypoint-checklist-item'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData((current) => ({ ...current, ...(data as ChecklistFormData) }))}
        onSubmit={(data) => {
          void handleSubmit(data as ChecklistFormData);
        }}
        submitButton={
          <div className='contents'>
            {(!formData.dueDate.enabled || !showNoteField) && (
              <div className='col-span-full mb-4'>
                <AddFieldChips
                  heading='Add to this task'
                  chips={[
                    ...(formData.dueDate.enabled
                      ? []
                      : [{ key: 'due', label: 'Complete by', icon: <CalendarDays className='h-4 w-4' /> }]),
                    ...(showNoteField ? [] : [{ key: 'note', label: 'Note', icon: <StickyNote className='h-4 w-4' /> }]),
                  ]}
                  onAdd={(key) =>
                    key === 'due'
                      ? resetField({ dueDate: { ...formData.dueDate, enabled: true } })
                      : setShowNoteField(true)
                  }
                />
              </div>
            )}
          <ModalFooterActions
            leftActions={
              item &&
              onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
            }
            cancelAction={
                <Button type='button' variant='secondary' onClick={onClose}>
                  Cancel
                </Button>
            }
            rightActions={
              <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  {isSubmitting ? 'Saving…' : item ? 'Save' : 'Add'}
                </Button>
            }
          />
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </FormSheet>
  );
}
