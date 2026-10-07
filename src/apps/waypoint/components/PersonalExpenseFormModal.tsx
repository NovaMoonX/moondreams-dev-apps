import { useMemo, useState } from 'react';

import { Button, Form, FormFactories, Select, Textarea } from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Lock, StickyNote } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { getDayOptions } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type { ExpenseCategory, ExpenseStatus, PersonalExpense, TripSpace } from '@apps/waypoint/types';
import {
  getExpenseCategoryKey,
  getExpenseCategoryKeyLabel,
  parseExpenseCategoryKey,
  toCustomCategoryKey,
} from '@apps/waypoint/utils/expenseCategories';

interface CategoryValue {
  choice: string;
  newLabel: string;
}

interface PersonalExpenseFormData {
  title: string;
  category: CategoryValue;
  amount: string;
  status: ExpenseStatus;
  dayIndex: string;
  note: string;
}

export interface PersonalExpenseSubmitValues {
  title: string;
  amount: number;
  status: ExpenseStatus;
  dayIndex: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
}

interface PersonalExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  initialExpense: PersonalExpense;
  categoryKeys: string[];
  isSubmitting?: boolean;
  onSubmit: (values: PersonalExpenseSubmitValues) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

const parseAmount = (value: string) => {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
};

const resolveCategory = ({ choice, newLabel }: CategoryValue) =>
  choice === NEW_CHOICE || choice === '' ? newLabel.trim() || null : choice;

function PersonalExpenseFormModal({
  isOpen,
  trip,
  initialExpense,
  categoryKeys,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: PersonalExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const [error, setError] = useState<string | null>(null);
  const [showNoteField, setShowNoteField] = useState(Boolean(initialExpense.note));
  const [formData, setFormData] = useState<PersonalExpenseFormData>({
    title: initialExpense.title,
    category: { choice: getExpenseCategoryKey(initialExpense), newLabel: '' },
    amount: String(initialExpense.amount),
    status: initialExpense.status,
    dayIndex: initialExpense.dayIndex === null ? '' : String(initialExpense.dayIndex),
    note: initialExpense.note ?? '',
  });
    const isFormComplete =
    formData.title.trim() !== '' && resolveCategory(formData.category) !== null && parseAmount(formData.amount) !== null;
  const dayOptions = useMemo(
    () => [
      { value: '', text: 'No specific day' },
      ...getDayOptions(trip.startDate, trip.endDate, initialExpense.dayIndex, MAX_DAYS_OUTSIDE_TRIP).map(
        ({ value, label }) => ({ value, text: label }),
      ),
    ],
    [trip.startDate, trip.endDate, initialExpense.dayIndex],
  );
  const categoryOptions = useMemo(
    () => categoryKeys.map((key) => ({ value: key, label: getExpenseCategoryKeyLabel(key) })),
    [categoryKeys],
  );

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      input({ name: 'title', label: 'Expense title', placeholder: 'Dinner reservation', variant: 'outline' }),
      input({ name: 'amount', label: 'How much is it?', type: 'number', placeholder: '0.00', variant: 'outline' }),
      custom({
        name: 'category',
        label: 'Category',
        renderComponent: (props) => {
          const value = props.value as CategoryValue;
          return (
            <PickOrCreate
              label='Category'
              options={categoryOptions}
              choice={value.choice}
              newText={value.newLabel}
              newPillLabel='New category'
              newPlaceholder='Souvenirs'
              onChange={(choice, newLabel) => props.onValueChange({ choice, newLabel })}
            />
          );
        },
      }),
      custom({
        name: 'status',
        label: 'Status',
        renderComponent: (props) => (
          <PillGroup
            label='Status'
            options={[
              { value: 'EXPECTED', label: 'Still to pay', emoji: '⏳' },
              { value: 'PAID', label: 'Already paid', emoji: '💸' },
            ]}
            value={props.value as ExpenseStatus}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
      custom({
        name: 'dayIndex',
        label: 'Trip day',
        renderComponent: (props) => (
          <Select options={dayOptions} value={props.value as string} onChange={(value) => props.onValueChange(value)} />
        ),
      }),
    ];

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
                placeholder='Anything worth remembering'
              />
            </RemovableField>
          ),
        }),
      );
    }

    return nextFields;
  }, [categoryOptions, dayOptions, showNoteField]);

  const handleSubmit = async (data: PersonalExpenseFormData) => {
    const amount = parseAmount(data.amount);
    const categoryChoice = resolveCategory(data.category);
    if (!data.title.trim() || amount === null || categoryChoice === null) {
      setError('Enter a title, a category and an amount.');
      return;
    }

    const { category, customCategoryLabel } = parseExpenseCategoryKey(
      data.category.choice === NEW_CHOICE ? toCustomCategoryKey(categoryChoice) : categoryChoice,
    );
    setError(null);
    try {
      await onSubmit({
        title: data.title,
        amount,
        status: data.status,
        dayIndex: data.dayIndex === '' ? null : Number(data.dayIndex),
        category,
        customCategoryLabel,
        note: showNoteField ? data.note.trim() || null : null,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this expense.'));
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete expense',
      message: `Delete "${initialExpense.title}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await onDelete();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this expense.'));
    }
  };

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title='Personal expense'>
      <p className='text-muted-foreground mb-4 flex items-start gap-2 text-sm'>
        <Lock className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
        <span>Only you can see this. It stays out of everyone’s list, totals and dues.</span>
      </p>
      <Form
        id='waypoint-personal-expense'
        form={fields}
        initialData={formData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as PersonalExpenseFormData)}
        onSubmit={(data) => void handleSubmit(data as PersonalExpenseFormData)}
        submitButton={
          <div className='contents'>
            {!showNoteField && (
              <div className='col-span-full mb-4'>
                <AddFieldChips
                  heading='Add to this expense'
                  chips={[{ key: 'note', label: 'Note', icon: <StickyNote className='h-4 w-4' /> }]}
                  onAdd={() => setShowNoteField(true)}
                />
              </div>
            )}
            <ModalFooterActions
              leftActions={
                <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
              }
              cancelAction={
                <Button type='button' variant='secondary' onClick={onClose}>
                  Cancel
                </Button>
              }
              rightActions={
                <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isFormComplete}>
                  {isSubmitting ? 'Saving…' : 'Save'}
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

export default PersonalExpenseFormModal;
