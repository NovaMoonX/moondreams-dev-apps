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
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowLeftRight, CalendarDays, Link2, Pencil, Route, StickyNote } from 'lucide-react';

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

const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

const describePrice = ({
  isEach,
  amount,
  headcount,
  isPick,
}: {
  isEach: boolean;
  amount: number | null;
  headcount: number;
  isPick: boolean;
}) => {
  if (headcount <= 1) {
    return 'It is just one person, so that is the whole amount.';
  }
  const people = `${headcount} people`;
  if (amount !== null) {
    return isEach
      ? `Each of the ${people} pays ${usd.format(amount)}, so ${usd.format(amount * headcount)} in total.`
      : `${usd.format(amount)} shared by ${people} is ${usd.format(amount / headcount)} each.`;
  }
  if (isEach) {
    return isPick
      ? `Each of the ${people} you picked pays this much.`
      : 'Everyone in the split pays this much, so the total grows with every person who joins.';
  }
  return 'We work out each person’s share for you.';
};

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
  dayIndex: string;
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
  dayIndex: number | null;
  currency: string;
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
  initialExpense?: TripExpense;
  prefill?: ExpensePrefill;
  /** Where a new expense starts: for the whole trip, or private to the person adding it. */
  initialAudience?: 'EVERYONE' | 'ME';
  /** `false` for someone who can't add trip expenses: the form is then only for private ones. */
  canShare?: boolean;
  categoryKeys: string[];
  /** Categories offered to a private expense: the trip's plus the person's own custom ones. */
  personalCategoryKeys?: string[];
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
  return value.trim() === '' || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
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
    dayIndex: getDayValue(initialExpense ? initialExpense.dayIndex : prefill?.dayIndex),
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
  personalCategoryKeys,
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
  const autoFill = useRef({ title: prefill?.title ?? '', category: prefill?.category ?? '', dayIndex: getDayValue(prefill?.dayIndex) });
  const hasChosenAudience = useRef(false);
  const [link, setLink] = useState<ExpenseLink | null>(initialExpense?.linkedTo ?? prefill?.link ?? null);
  const [showGroupField, setShowGroupField] = useState(Boolean(initialExpense?.groupLabel));
  const [showNoteField, setShowNoteField] = useState(Boolean(initialExpense?.note));
  const [showDayField, setShowDayField] = useState(
    initialExpense ? initialExpense.dayIndex !== null : prefill?.dayIndex != null,
  );
  const [showTitleFields, setShowTitleFields] = useState(false);
  const [isPlanAnswered, setIsPlanAnswered] = useState(false);
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
  const asksAboutPlan =
    !isEditing && !prefill && canShare && !isPrivate && linkables.length > 0 && !isPlanAnswered;
  const isLinked = !isEditing && !isPrivate && Boolean(pickedSubject);
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
  const showLinkPicker = isEditing && linkables.length > 0;
  const dayOptions = useMemo(
    () => [
      { value: '', label: 'No specific day' },
      ...getDayOptions(trip.startDate, trip.endDate, storedDayIndex, MAX_DAYS_OUTSIDE_TRIP),
    ],
    [trip.startDate, trip.endDate, storedDayIndex],
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
    () =>
      (isPrivate ? (personalCategoryKeys ?? categoryKeys) : categoryKeys).map((key) => ({
        value: key,
        text: getExpenseCategoryKeyLabel(key),
      })),
    [categoryKeys, isPrivate, personalCategoryKeys],
  );
  const groupOptions = useMemo(
    () => existingGroupLabels.map((label) => ({ value: label, text: label })),
    [existingGroupLabels],
  );
  const sharesPrice = !isPrivate && !(audience === 'PICK' && pickedIds.length <= 1);

  const areTitleFieldsVisible = isEditing || !isLinked || showTitleFields || resolveChoice(formData.category) === null;
  const hasDayField = linkedDay === null && (showDayField || formData.dayIndex !== '');

  const resetField = (patch: Partial<ExpenseFormData>) => {
    setFormData((current) => ({ ...current, ...patch }));
    setFormKey((key) => key + 1);
  };

  const fields = useMemo(() => {
    const nextFields: FormField[] = areTitleFieldsVisible
      ? [
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
        ]
      : [];
    nextFields.push(
      custom({
        name: 'price',
        label: '',
        renderComponent: (props) => {
          const value = props.value as PriceValue;
          const valueMode = isPrivate ? 'amount' : value.mode;
          const isEach = value.isPerPerson && sharesPrice;
          const priceToggle = sharesPrice && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-sm'>Price is</p>
              <PillGroup
                label='Price is'
                options={[
                  { value: 'group', label: 'Total' },
                  { value: 'each', label: 'Per person' },
                ]}
                value={value.isPerPerson ? 'each' : 'group'}
                onChange={(next) => props.onValueChange({ ...value, isPerPerson: next === 'each' })}
              />
            </div>
          );
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
              {valueMode === 'amount' ? (
                <div className={join('grid items-start gap-3', sharesPrice && 'min-[360px]:grid-cols-2')}>
                  <div className='space-y-1.5'>
                    <p className='text-muted-foreground text-sm'>Amount</p>
                    <Input
                      type='number'
                      aria-label='Amount'
                      placeholder='0.00'
                      variant='outline'
                      value={value.amount}
                      onChange={(event) => props.onValueChange({ ...value, amount: event.target.value })}
                    />
                  </div>
                  {priceToggle}
                </div>
              ) : (
                <>
                  <div className='grid grid-cols-2 gap-3'>
                    <div className='space-y-1.5'>
                      <p className='text-muted-foreground text-sm'>Lowest</p>
                      <Input
                        type='number'
                        aria-label='Lowest it could be'
                        placeholder='0.00'
                        variant='outline'
                        value={value.min}
                        onChange={(event) => props.onValueChange({ ...value, min: event.target.value })}
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <p className='text-muted-foreground text-sm'>Highest</p>
                      <Input
                        type='number'
                        aria-label='Highest it could be'
                        placeholder='0.00'
                        variant='outline'
                        value={value.max}
                        onChange={(event) => props.onValueChange({ ...value, max: event.target.value })}
                      />
                    </div>
                  </div>
                  {priceToggle}
                </>
              )}
              {sharesPrice && (
                <p className='text-muted-foreground text-xs'>
                  {describePrice({
                    isEach,
                    amount: valueMode === 'amount' ? parseAmount(value.amount) : null,
                    headcount: audience === 'PICK' ? pickedIds.length : memberIds.length,
                    isPick: audience === 'PICK',
                  })}
                </p>
              )}
            </div>
          );
        },
      }),
    );

    if (hasDayField) {
      nextFields.push(
        custom({
          name: 'dayIndex',
          label: '',
          renderComponent: (props) => (
            <RemovableField
              label='Trip day'
              removeLabel='Remove day'
              onRemove={() => {
                setShowDayField(false);
                resetField({ dayIndex: '' });
              }}
            >
              <Select
                options={dayOptions.map(({ value, label }) => ({ value, text: label }))}
                value={props.value as string}
                onChange={(value) => props.onValueChange(value)}
              />
            </RemovableField>
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
    areTitleFieldsVisible,
    categoryOptions,
    dayOptions,
    groupOptions,
    hasDayField,
    isPrivate,
    audience,
    memberIds.length,
    pickedIds.length,
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
    setIsPlanAnswered(true);
    if (isEditing) {
      if (formData.dayIndex === '' && picked.dayIndex !== null) {
        setFormData((current) => ({ ...current, dayIndex: getDayValue(picked.dayIndex) }));
        setFormKey((key) => key + 1);
      }
      return;
    }
    const nextAudience = getAudienceFromAttendees(picked.attendeeIds, memberIds);
    const isAudienceUntouched = !hasChosenAudience.current;
    const previous = autoFill.current;
    setFormData((current) => ({
      ...current,
      title: current.title.trim() === '' || current.title === previous.title ? picked.title : current.title,
      dayIndex:
        current.dayIndex === previous.dayIndex || current.dayIndex === '' ? getDayValue(picked.dayIndex) : current.dayIndex,
      category:
        picked.expenseCategory && (current.category.choice === '' || current.category.choice === previous.category)
          ? { choice: picked.expenseCategory, newLabel: '' }
          : current.category,
    }));
    autoFill.current = {
      title: picked.title,
      category: picked.expenseCategory ?? previous.category,
      dayIndex: getDayValue(picked.dayIndex),
    };
    if (isAudienceUntouched) {
      setAudienceValue(nextAudience);
    }
    setFormKey((key) => key + 1);
  };

  const handleSubmit = async (submitted: ExpenseFormData) => {
    const data = { ...formData, ...submitted };
    const submittedMode = isPrivate ? 'amount' : data.price.mode;
    const amount = submittedMode === 'amount' ? parseAmount(data.price.amount) : null;
    const amountMin = submittedMode === 'range' ? parseAmount(data.price.min) : null;
    const amountMax = submittedMode === 'range' ? parseAmount(data.price.max) : null;
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
          status: 'EXPECTED',
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
        dayIndex,
        currency: 'USD',
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

  const chips = [
    ...(hasDayField || linkedDay !== null ? [] : [{ key: 'day', label: 'Trip day', icon: <CalendarDays className='h-4 w-4' /> }]),
    ...(showGroupField || isPrivate ? [] : [{ key: 'group', label: 'Group', icon: <Route className='h-4 w-4' /> }]),
    ...(showNoteField ? [] : [{ key: 'note', label: 'Note', icon: <StickyNote className='h-4 w-4' /> }]),
  ];
  const addChip = (key: string) => {
    if (key === 'day') {
      setShowDayField(true);
    } else if (key === 'group') {
      setShowGroupField(true);
    } else {
      setShowNoteField(true);
    }
  };
  const summaryDay = formData.dayIndex === '' ? null : getDayDateLabel(trip.startDate, Number(formData.dayIndex));
  const summaryCategory = resolveChoice(formData.category);
  const planQuestion = (
    <div className='space-y-3 max-sm:min-h-[44dvh]'>
      <div className='space-y-1.5'>
        <Label>What&apos;s this expense for?</Label>
        <Select
          searchable
          options={linkOptions.filter((option) => option.value !== NO_LINK)}
          value={linkKey}
          placeholder='Pick an event, stay or rental'
          searchPlaceholder='Search your plans'
          onChange={pickLink}
        />
      </div>
      <Button
        type='button'
        variant='secondary'
        onClick={() => {
          setLink(null);
          setIsPlanAnswered(true);
        }}
      >
        Something else
      </Button>
    </div>
  );

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={isPrivate ? 'Personal expense' : 'Expense'}>
      {asksAboutPlan ? (
        <>
          {planQuestion}
          <div className='mt-6'>
            <ModalFooterActions
              cancelAction={
                <Button type='button' variant='secondary' onClick={onClose}>
                  Cancel
                </Button>
              }
              rightActions={null}
            />
          </div>
        </>
      ) : (
        <>
          {isLinked && pickedSubject && (
            <div className='bg-muted/50 mb-4 space-y-1 rounded-xl p-3'>
              <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Paying for</p>
              <p className='font-semibold'>{pickedSubject.title}</p>
              <p className='text-muted-foreground text-sm'>
                {[
                  summaryCategory ? getExpenseCategoryKeyLabel(summaryCategory) : null,
                  summaryDay,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No category or day yet'}
              </p>
              <div className='flex flex-wrap gap-x-4 gap-y-1 pt-1'>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='min-h-10 gap-1.5 px-0!'
                  onClick={() => setIsPlanAnswered(false)}
                >
                  <ArrowLeftRight className='h-3.5 w-3.5' aria-hidden='true' />
                  Change
                </Button>
                {!showTitleFields && (
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className='min-h-10 gap-1.5 px-0!'
                    onClick={() => setShowTitleFields(true)}
                  >
                    <Pencil className='h-3.5 w-3.5' aria-hidden='true' />
                    Edit title or category
                  </Button>
                )}
              </div>
            </div>
          )}
          {!isEditing && !prefill && canShare && !isPrivate && !isLinked && linkables.length > 0 && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='mb-2 min-h-10 gap-1.5 px-0!'
              onClick={() => setIsPlanAnswered(false)}
            >
              <Link2 className='h-3.5 w-3.5' aria-hidden='true' />
              Link it to a plan
            </Button>
          )}
          {!isEditing && canShare && (
            <div className='mb-4 space-y-2'>
              <Label>Who&apos;s this for?</Label>
              <PillGroup
                label="Who's this for"
                options={audienceOptions}
                value={audience}
                onChange={(next) => {
                  hasChosenAudience.current = true;
                  setIsPlanAnswered(true);
                  setAudienceValue((current) => ({ ...current, audience: next }));
                  if (next === 'ME' && price.mode === 'range' && price.amount.trim() === '') {
                    resetField({ price: { ...price, mode: 'amount', amount: price.max || price.min } });
                  }
                }}
              />
              {audience === 'PICK' && (
                <>
                  <MultiPillGroup
                    label='People'
                    options={memberPillOptions}
                    values={pickedIds}
                    onChange={(next) => {
                      hasChosenAudience.current = true;
                      setAudienceValue((current) => ({ ...current, memberIds: next }));
                    }}
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
              <Label>What&apos;s this expense for?</Label>
              <Select
                searchable
                options={linkOptions}
                value={linkKey || NO_LINK}
                placeholder='Pick an event, stay or rental to fill in its details'
                searchPlaceholder='Search your plans'
                onChange={(value) => (value === NO_LINK ? setLink(null) : pickLink(value))}
              />
            </div>
          )}
          <Form
            key={formKey}
            id='waypoint-add-expense'
            form={fields}
            initialData={formData}
            columns={1}
            spacing='normal'
            onDataChange={(data) => setFormData((current) => ({ ...current, ...(data as ExpenseFormData) }))}
            onSubmit={(data) => void handleSubmit(data as ExpenseFormData)}
            submitButton={
              <div className='contents'>
                {chips.length > 0 && (
                  <div className='col-span-full mb-4'>
                    <AddFieldChips heading='Add to this expense' chips={chips} onAdd={addChip} />
                  </div>
                )}
                <ModalFooterActions
                  leftActions={
                    isEditing &&
                    onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
                  }
                  cancelAction={
                    <Button type='button' variant='secondary' onClick={onClose}>
                      Cancel
                    </Button>
                  }
                  rightActions={
                    <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isFormComplete}>
                      {isSubmitting ? (isEditing ? 'Saving…' : 'Adding…') : isEditing ? 'Save' : 'Add'}
                    </Button>
                  }
                />
              </div>
            }
          />
          {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
        </>
      )}
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
