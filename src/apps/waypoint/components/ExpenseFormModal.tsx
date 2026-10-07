import { useMemo, useRef, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Route, StickyNote } from 'lucide-react';

import { getErrorMessage } from '@/utils/errorUtils';
import { formatClockTime } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import { selectSortedRentals, selectSortedStays, selectSortedTimelineEvents } from '@apps/waypoint/store/selectors';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayCount, getDayDateLabel, getDayLabel, getDayOptions } from '@/utils/dateRangeUtils';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import type { PersonalExpenseSubmitValues } from '@apps/waypoint/components/PersonalExpenseFormModal';
import { getEarlyPayments } from '@apps/waypoint/utils/splitCalculators';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type {
  ExpenseCategory,
  ExpenseLink,
  ExpenseStatus,
  TripExpense,
  TripSpace,
} from '@apps/waypoint/types';
import { getExpenseLinkKey, getLinkableSubjects } from '@apps/waypoint/utils/relatedSubjects';
import {
  getExpenseCategoryKey,
  getExpenseCategoryKeyLabel,
  parseExpenseCategoryKey,
  toCustomCategoryKey,
} from '@apps/waypoint/utils/expenseCategories';

const PAID_BY_EACH_PERSON = '';

const NO_LINK = 'none';

const LINK_KIND_LABELS: Record<ExpenseLink['kind'], string> = {
  EVENT: 'Event',
  STAY: 'Stay',
  RENTAL: 'Rental',
};

interface ChoiceValue {
  choice: string;
  newLabel: string;
}

interface PriceValue {
  mode: 'amount' | 'range';
  isPerPerson: boolean;
  amount: string;
  min: string;
  max: string;
}

interface ExpenseFormData {
  title: string;
  category: ChoiceValue;
  price: PriceValue;
  payerUid: string;
  status: ExpenseStatus;
  dayIndex: string;
  paidAmount: string;
  note: string;
  group: ChoiceValue;
}

type Audience = 'EVERYONE' | 'PICK' | 'ME';

interface AudienceValue {
  audience: Audience;
  memberIds: string[];
}

export interface ExpenseSubmitValues {
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  payerUid: string | null;
  status: ExpenseStatus;
  dayIndex: number | null;
  currency: string;
  paidAmount: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
  groupLabel: string | null;
  isPerPerson: boolean;
  linkedTo: ExpenseLink | null;
  /** Who shares it; `null` when editing, where the split has its own action. */
  split: { targetType: 'EVERYONE_CURRENT' | 'SPECIFIC_MEMBERS'; targetMemberIds: string[] } | null;
}

export interface ExpensePrefill {
  attendeeIds: string[] | null;
  link: ExpenseLink;
  title: string;
  dayIndex: number | null;
  category: ExpenseCategory | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  currentUserId: string;
  initialExpense?: TripExpense;
  prefill?: ExpensePrefill;
  /** Where a new expense starts: for the whole trip, or private to the person adding it. */
  initialAudience?: 'EVERYONE' | 'ME';
  /** `false` for someone who can't add trip expenses: the form is then only for private ones. */
  canShare?: boolean;
  categoryKeys: string[];
  existingGroupLabels: string[];
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSubmitValues) => Promise<void> | void;
  /** Saves it as private to the person adding it; without it, "Just me" isn't offered. */
  onSubmitPersonal?: (values: PersonalExpenseSubmitValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input } = FormFactories;

function parseAmount(value: string): number | null {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

function resolveChoice({ choice, newLabel }: ChoiceValue): string | null {
  if (choice === NEW_CHOICE || choice === '') {
    return newLabel.trim() || null;
  }
  return choice;
}

function getAudienceFromAttendees(attendeeIds: string[] | null | undefined, tripMemberIds: string[]): AudienceValue {
  const current = (attendeeIds ?? []).filter((uid) => tripMemberIds.includes(uid));
  return current.length === 0 ? { audience: 'EVERYONE', memberIds: [] } : { audience: 'PICK', memberIds: current };
}

function getDayValue(dayIndex: number | null | undefined): string {
  return dayIndex === null || dayIndex === undefined ? '' : String(dayIndex);
}

function getInitialFormData(initialExpense?: TripExpense, prefill?: ExpensePrefill): ExpenseFormData {
  return {
    title: initialExpense?.title ?? prefill?.title ?? '',
    category: {
      choice: initialExpense ? getExpenseCategoryKey(initialExpense) : (prefill?.category ?? ''),
      newLabel: '',
    },
    price: {
      mode: initialExpense?.amount === null ? 'range' : 'amount',
      isPerPerson: initialExpense?.isPerPerson ?? false,
      amount: initialExpense?.amount === null ? '' : String(initialExpense?.amount ?? ''),
      min: String(initialExpense?.amountMin ?? ''),
      max: String(initialExpense?.amountMax ?? ''),
    },
    payerUid: initialExpense?.payerUid ?? PAID_BY_EACH_PERSON,
    status: initialExpense?.status ?? 'EXPECTED',
    dayIndex: getDayValue(initialExpense ? initialExpense.dayIndex : prefill?.dayIndex),
    paidAmount: String(initialExpense?.paidAmount ?? ''),
    note: initialExpense?.note ?? '',
    group: { choice: initialExpense?.groupLabel ?? '', newLabel: '' },
  };
}

function ExpenseFormModal({
  isOpen,
  trip,
  initialExpense,
  prefill,
  initialAudience = 'EVERYONE',
  canShare = true,
  categoryKeys,
  existingGroupLabels,
  isSubmitting = false,
  onSubmit,
  onSubmitPersonal,
  onDelete,
  onClose,
}: ExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const [error, setError] = useState<string | null>(null);
  const events = useAppSelector(selectSortedTimelineEvents);
  const stays = useAppSelector(selectSortedStays);
  const rentals = useAppSelector(selectSortedRentals);
  const isEditing = Boolean(initialExpense);
  const memberIds = useMemo(() => Object.keys(trip.members), [trip.members]);
  const linkables = useMemo(
    () => (isOpen && !prefill ? getLinkableSubjects(trip, events, stays, rentals) : []),
    [isOpen, prefill, trip, events, stays, rentals],
  );
  const [formData, setFormData] = useState<ExpenseFormData>(() => getInitialFormData(initialExpense, prefill));
  // The form reads its data once, so picking a plan remounts it with the filled-in values.
  const [formKey, setFormKey] = useState(0);
  const [audienceValue, setAudienceValue] = useState<AudienceValue>(() =>
    onSubmitPersonal && (!canShare || initialAudience === 'ME')
      ? { audience: 'ME', memberIds: [] }
      : getAudienceFromAttendees(prefill?.attendeeIds, memberIds),
  );
  const autoAudience = useRef<AudienceValue>(audienceValue);
  const autoFill = useRef({ title: prefill?.title ?? '', category: prefill?.category ?? '' });
  const [link, setLink] = useState<ExpenseLink | null>(initialExpense?.linkedTo ?? prefill?.link ?? null);
  const [showGroupField, setShowGroupField] = useState(Boolean(initialExpense?.groupLabel));
  const [showNoteField, setShowNoteField] = useState(Boolean(initialExpense?.note));
  const memberInfo = useUserInfo(memberIds);
  const { audience, memberIds: pickedIds } = audienceValue;
  const isPrivate = audience === 'ME';
  const { price } = formData;
  const mode = isPrivate ? 'amount' : price.mode;
  const rangeMin = parseAmount(price.min);
  const rangeMax = parseAmount(price.max);
  const isFormComplete =
    formData.title.trim() !== '' &&
    resolveChoice(formData.category) !== null &&
    (mode === 'amount'
      ? parseAmount(price.amount) !== null
      : rangeMin !== null && rangeMax !== null && rangeMax >= rangeMin) &&
    (isEditing || audience !== 'PICK' || pickedIds.length > 0);
  const linkKey = link ? getExpenseLinkKey(link) : '';
  const pickedSubject = linkables.find((subject) => getExpenseLinkKey(subject.link) === linkKey);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const linkedDay = !isEditing && !isPrivate && pickedSubject?.dayIndex != null ? pickedSubject.dayIndex : null;
  const storedDayIndex = initialExpense?.dayIndex ?? pickedSubject?.dayIndex ?? prefill?.dayIndex ?? null;
  const linkOptions = useMemo(
    () => [
      { value: NO_LINK, text: 'Not for a plan', description: 'Just a cost on its own' },
      ...linkables.map((subject) => ({
        value: getExpenseLinkKey(subject.link),
        text: subject.title,
        description: [
          LINK_KIND_LABELS[subject.link.kind],
          subject.dayIndex === null ? 'No specific day' : getDayLabel(trip.startDate, subject.dayIndex, dayCount),
          ...(subject.time ? [formatClockTime(subject.time)] : []),
        ].join(' · '),
      })),
    ],
    [linkables, trip.startDate, dayCount],
  );
  const showLinkPicker = linkables.length > 0 && !isPrivate;
  const dayOptions = useMemo(
    () => [
      { value: '', label: 'No specific day' },
      ...getDayOptions(trip.startDate, trip.endDate, storedDayIndex, MAX_DAYS_OUTSIDE_TRIP),
    ],
    [trip.startDate, trip.endDate, storedDayIndex],
  );
  const payerOptions = useMemo(
    () => [
      { value: PAID_BY_EACH_PERSON, label: 'Paid by each person' },
      ...memberIds.map((uid) => ({
        value: uid,
        label: memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid,
      })),
    ],
    [memberIds, memberInfo],
  );
  const memberPillOptions = useMemo(
    () =>
      memberIds.map((uid) => ({
        value: uid,
        label: memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid,
      })),
    [memberIds, memberInfo],
  );
  const categoryOptions = useMemo(
    () => categoryKeys.map((key) => ({ value: key, text: getExpenseCategoryKeyLabel(key) })),
    [categoryKeys],
  );
  const groupOptions = useMemo(
    () => existingGroupLabels.map((label) => ({ value: label, text: label })),
    [existingGroupLabels],
  );
  const sharesPrice = !isPrivate && !(audience === 'PICK' && pickedIds.length <= 1);

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      input({
        name: 'title',
        label: 'Expense title',
        placeholder: 'Dinner reservation',
        variant: 'outline',
      }),
      custom({
        name: 'category',
        label: 'Category',
        renderComponent: (props) => (
          <ChoiceField
            value={props.value as ChoiceValue}
            onValueChange={props.onValueChange as (value: ChoiceValue) => void}
            label='Category'
            options={categoryOptions}
            newPillLabel='New category'
            newPlaceholder='Souvenirs'
          />
        ),
      }),
      custom({
        name: 'price',
        label: '',
        renderComponent: (props) => {
          const value = props.value as PriceValue;
          const valueMode = isPrivate ? 'amount' : value.mode;
          const isEach = value.isPerPerson && sharesPrice;
          const amountLabel =
            valueMode === 'range'
              ? isEach
                ? 'What each person might pay'
                : 'Estimated total'
              : isEach
                ? 'What each person pays'
                : sharesPrice
                  ? 'Total to split'
                  : 'Amount';
          return (
            <div className='space-y-3'>
              <Label>How much is it?</Label>
              {!isPrivate && (
                <PillGroup
                  label='Exact or estimated'
                  options={[
                    { value: 'amount', label: 'Exact amount', emoji: '🧾' },
                    { value: 'range', label: 'Estimate', emoji: '🔮' },
                  ]}
                  value={value.mode}
                  onChange={(next) => props.onValueChange({ ...value, mode: next })}
                />
              )}
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-sm'>{amountLabel}</p>
                {valueMode === 'amount' ? (
                  <Input
                    type='number'
                    aria-label={amountLabel}
                    placeholder='0.00'
                    variant='outline'
                    value={value.amount}
                    onChange={(event) => props.onValueChange({ ...value, amount: event.target.value })}
                  />
                ) : (
                  <div className='grid grid-cols-2 gap-3'>
                    <Input
                      type='number'
                      aria-label='Lowest it could be'
                      placeholder='Lowest'
                      variant='outline'
                      value={value.min}
                      onChange={(event) => props.onValueChange({ ...value, min: event.target.value })}
                    />
                    <Input
                      type='number'
                      aria-label='Highest it could be'
                      placeholder='Highest'
                      variant='outline'
                      value={value.max}
                      onChange={(event) => props.onValueChange({ ...value, max: event.target.value })}
                    />
                  </div>
                )}
              </div>
              {sharesPrice && (
                <div className='space-y-1.5'>
                  <PillGroup
                    label='This price is for'
                    options={[
                      { value: 'group', label: 'Everyone together', emoji: '🧮' },
                      { value: 'each', label: 'Each person', emoji: '🙋' },
                    ]}
                    value={value.isPerPerson ? 'each' : 'group'}
                    onChange={(next) => props.onValueChange({ ...value, isPerPerson: next === 'each' })}
                  />
                  <p className='text-muted-foreground text-xs'>
                    {value.isPerPerson
                      ? 'Everyone in the split pays this much, so the total grows with every person who joins.'
                      : 'We work out each person’s share for you.'}
                  </p>
                </div>
              )}
            </div>
          );
        },
      }),
    ];

    if (isEditing && price.mode === 'range' && initialExpense?.status === 'PAID') {
      nextFields.push(
        input({
          name: 'paidAmount',
          label: price.isPerPerson ? 'What each person paid' : 'Total paid',
          type: 'number',
          placeholder: '0.00',
          variant: 'outline',
        }),
      );
    }

    nextFields.push(
      custom({
        name: 'status',
        label: 'Status',
        renderComponent: (props) => (
          <PillGroup
            label='Status'
            options={
              isPrivate
                ? [
                    { value: 'EXPECTED', label: 'Still to pay', emoji: '⏳' },
                    { value: 'PAID', label: 'Already paid', emoji: '💸' },
                  ]
                : [
                    { value: 'EXPECTED', label: 'Expected', emoji: '⏳' },
                    { value: 'PAID', label: 'Paid', emoji: '💸' },
                  ]
            }
            value={props.value as ExpenseFormData['status']}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
    );

    if (formData.status === 'PAID' && !isPrivate) {
      nextFields.push(
        custom({
          name: 'payerUid',
          label: 'Paid by',
          renderComponent: (props) => (
            <PillGroup
              label='Paid by'
              options={payerOptions}
              value={props.value as string}
              onChange={(value) => props.onValueChange(value)}
            />
          ),
        }),
      );
    }

    if (linkedDay === null) {
      nextFields.push(
        custom({
          name: 'dayIndex',
          label: 'Trip day',
          renderComponent: (props) => (
            <Select
              options={dayOptions.map(({ value, label }) => ({ value, text: label }))}
              value={props.value as string}
              onChange={(value) => props.onValueChange(value)}
            />
          ),
        }),
      );
    }

    if (showGroupField && !isPrivate) {
      nextFields.push(
        custom({
          name: 'group',
          label: '',
          renderComponent: (props) => (
            <RemovableField label='Group' removeLabel='Remove from group' onRemove={() => setShowGroupField(false)}>
              <ChoiceField
                value={props.value as ChoiceValue}
                onValueChange={props.onValueChange as (value: ChoiceValue) => void}
                label='Group'
                options={groupOptions}
                newPillLabel='New group'
                newPlaceholder='Dinner at Ichiran'
              />
            </RemovableField>
          ),
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
                placeholder='Anything worth remembering about this expense'
              />
            </RemovableField>
          ),
        }),
      );
    }

    return nextFields;
  }, [
    categoryOptions,
    dayOptions,
    formData.status,
    groupOptions,
    initialExpense?.status,
    isEditing,
    isPrivate,
    linkedDay,
    payerOptions,
    price.isPerPerson,
    price.mode,
    sharesPrice,
    showGroupField,
    showNoteField,
  ]);

  const pickLink = (nextKey: string) => {
    const picked = linkables.find((subject) => getExpenseLinkKey(subject.link) === nextKey);
    if (!picked) {
      return;
    }

    setLink(picked.link);
    if (isEditing) {
      if (formData.dayIndex === '' && picked.dayIndex !== null) {
        setFormData((current) => ({ ...current, dayIndex: getDayValue(picked.dayIndex) }));
        setFormKey((key) => key + 1);
      }
      return;
    }
    const nextAudience = getAudienceFromAttendees(picked.attendeeIds, memberIds);
    const isAudienceUntouched = JSON.stringify(audienceValue) === JSON.stringify(autoAudience.current);
    const previous = autoFill.current;
    setFormData((current) => ({
      ...current,
      title: current.title.trim() === '' || current.title === previous.title ? picked.title : current.title,
      dayIndex: picked.dayIndex === null ? current.dayIndex : getDayValue(picked.dayIndex),
      category:
        picked.expenseCategory && (current.category.choice === '' || current.category.choice === previous.category)
          ? { choice: picked.expenseCategory, newLabel: '' }
          : current.category,
    }));
    autoFill.current = { title: picked.title, category: picked.expenseCategory ?? previous.category };
    if (isAudienceUntouched) {
      setAudienceValue(nextAudience);
      autoAudience.current = nextAudience;
    }
    setFormKey((key) => key + 1);
  };

  const handleSubmit = async (data: ExpenseFormData) => {
    const submittedMode = isPrivate ? 'amount' : data.price.mode;
    const amount = submittedMode === 'amount' ? parseAmount(data.price.amount) : null;
    const amountMin = submittedMode === 'range' ? parseAmount(data.price.min) : null;
    const amountMax = submittedMode === 'range' ? parseAmount(data.price.max) : null;
    const paidAmount =
      isEditing && submittedMode === 'range' && initialExpense?.status === 'PAID' ? parseAmount(data.paidAmount) : null;
    const categoryChoice = resolveChoice(data.category);

    if (
      !data.title.trim() ||
      categoryChoice === null ||
      (submittedMode === 'amount' && amount === null) ||
      (submittedMode === 'range' && (amountMin === null || amountMax === null))
    ) {
      setError('Enter a title, a category, and a valid amount.');
      return;
    }

    const categoryKey = data.category.choice === NEW_CHOICE ? toCustomCategoryKey(categoryChoice) : categoryChoice;
    const { category, customCategoryLabel } = parseExpenseCategoryKey(categoryKey);
    const dayIndex = linkedDay !== null ? linkedDay : data.dayIndex === '' ? null : Number(data.dayIndex);

    setError(null);
    try {
      if (isPrivate && onSubmitPersonal && amount !== null) {
        await onSubmitPersonal({
          title: data.title,
          amount,
          status: data.status,
          dayIndex,
          category,
          customCategoryLabel,
          note: showNoteField ? data.note.trim() || null : null,
        });
        return;
      }
      await onSubmit({
        title: data.title,
        amount,
        amountMin,
        amountMax,
        payerUid: data.status === 'PAID' && data.payerUid !== '' ? data.payerUid : null,
        status: data.status,
        dayIndex,
        currency: 'USD',
        paidAmount,
        category,
        customCategoryLabel,
        note: showNoteField ? data.note.trim() || null : null,
        groupLabel: showGroupField ? resolveChoice(data.group) : null,
        isPerPerson: sharesPrice ? data.price.isPerPerson : false,
        linkedTo: link,
        split: isEditing
          ? null
          : audience === 'EVERYONE'
            ? { targetType: 'EVERYONE_CURRENT', targetMemberIds: [] }
            : { targetType: 'SPECIFIC_MEMBERS', targetMemberIds: pickedIds.filter((uid) => memberIds.includes(uid)) },
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this expense.'));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }
    if (initialExpense && Object.keys(getEarlyPayments(initialExpense)).length > 0) {
      setError('Someone recorded paying toward this early. Remove it from the Dues summary (Remove, next to the early payment) before deleting.');
      return;
    }

    const confirmed = await confirm({
      title: 'Delete expense',
      message: `Delete "${initialExpense?.title}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await onDelete();
  };

  const audienceOptions = [
    { value: 'EVERYONE' as const, label: 'Everyone', emoji: '👥' },
    { value: 'PICK' as const, label: 'Pick people', emoji: '🎯' },
    ...(onSubmitPersonal ? [{ value: 'ME' as const, label: 'Just me', emoji: '🔒' }] : []),
  ];
  const privateNote = 'Only you can see this. It stays out of everyone’s list, totals and dues.';

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={isPrivate ? 'Personal expense' : 'Expense'}>
      {!isEditing && canShare && (
        <div className='mb-4 space-y-2'>
          <Label>Who&apos;s this for?</Label>
          <PillGroup
            label="Who's this for"
            options={audienceOptions}
            value={audience}
            onChange={(next) => setAudienceValue((current) => ({ ...current, audience: next }))}
          />
          {audience === 'PICK' && (
            <>
              <MultiPillGroup
                label='People'
                options={memberPillOptions}
                values={pickedIds}
                onChange={(next) => setAudienceValue((current) => ({ ...current, memberIds: next }))}
              />
              {pickedIds.length === 0 && (
                <p className='text-muted-foreground text-sm'>Pick at least one person to share it.</p>
              )}
            </>
          )}
          {isPrivate && <p className='text-muted-foreground text-xs'>{privateNote}</p>}
        </div>
      )}
      {!isEditing && !canShare && <p className='text-muted-foreground mb-4 text-sm'>{privateNote}</p>}
      {showLinkPicker && (
        <div className='mb-4 space-y-1.5'>
          <Label>What is this paying for?</Label>
          <Select
            searchable
            options={linkOptions}
            value={linkKey || NO_LINK}
            placeholder='Pick an event, stay or rental to fill in its details'
            searchPlaceholder='Search your plans'
            onChange={(value) => (value === NO_LINK ? setLink(null) : pickLink(value))}
          />
          {linkedDay !== null && (
            <p className='text-muted-foreground text-xs'>
              {getDayDateLabel(trip.startDate, linkedDay)} comes from the plan. Its title and category are filled in
              too, and you can still change them.
            </p>
          )}
        </div>
      )}
      <Form
        key={formKey}
        id='waypoint-add-expense'
        form={fields}
        initialData={formData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as ExpenseFormData)}
        onSubmit={(data) => void handleSubmit(data as ExpenseFormData)}
        submitButton={
          <div className='contents'>
            {((!showGroupField && !isPrivate) || !showNoteField) && (
              <div className='col-span-full mb-4'>
                <AddFieldChips
                  heading='Add to this expense'
                  chips={[
                    ...(showGroupField || isPrivate ? [] : [{ key: 'group', label: 'Group', icon: <Route className='h-4 w-4' /> }]),
                    ...(showNoteField ? [] : [{ key: 'note', label: 'Note', icon: <StickyNote className='h-4 w-4' /> }]),
                  ]}
                  onAdd={(key) => (key === 'group' ? setShowGroupField(true) : setShowNoteField(true))}
                />
              </div>
            )}
            <ModalFooterActions
              leftActions={
                isEditing &&
                onDelete && (
                  <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
                )
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
                    {isSubmitting
                      ? isEditing
                        ? 'Saving…'
                        : 'Adding…'
                      : isEditing
                        ? 'Save'
                        : 'Add'}
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

function ChoiceField({
  label,
  value,
  onValueChange,
  options,
  newPillLabel,
  newPlaceholder,
}: {
  label: string;
  value: ChoiceValue;
  onValueChange: (value: ChoiceValue) => void;
  options: { value: string; text: string }[];
  newPillLabel: string;
  newPlaceholder: string;
}) {
  return (
    <PickOrCreate
      label={label}
      options={options.map((option) => ({ value: option.value, label: option.text }))}
      choice={value.choice}
      newText={value.newLabel}
      newPillLabel={newPillLabel}
      newPlaceholder={newPlaceholder}
      onChange={(choice, newLabel) => onValueChange({ choice, newLabel })}
    />
  );
}

export default ExpenseFormModal;
