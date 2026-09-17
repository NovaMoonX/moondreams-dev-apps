import { useMemo, useState } from 'react';

import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Form,
  FormFactories,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft, ChevronRight } from '@moondreamsdev/dreamer-ui/symbols';
import { shallowEqual } from 'react-redux';

import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils';
import { getInitials } from '@/utils/accountUtils';

import { useAppSelector } from '@/store';

import {
  selectConditionsByCat,
  selectSymptomsByCat,
  selectWeightEntriesByCat,
} from '../store/selectors';
import type {
  Cat,
  CatCondition,
  ExpenseLineItem,
  Symptom,
  Visit,
  VisitReason,
} from '../types';
import type { VisitOutcome } from '../store/actions/visitsActions';
import { createEmptyLineItem, type LineItemValue } from '../utils/expenseLineItems';
import { getVisitOptions } from '../utils/visitOptions';
import CatPillSelector from './CatPillSelector';
import DeleteIconButton from './DeleteIconButton';
import DetailsDisclosure from './DetailsDisclosure';
import ExpenseLineItemsField from './ExpenseLineItemsField';
import ModalFooterActions from './ModalFooterActions';

export interface VisitExpenseDraft {
  catIds: string[];
  items: ExpenseLineItem[];
  incurredAt: number;
  label: string | null;
}

interface VisitFormModalProps {
  isOpen: boolean;
  cats: Cat[];
  clinics?: Array<{ id: string; name: string }>;
  doctors?: Array<{ id: string; name: string; clinicId: string }>;
  visits?: Visit[];
  initialVisit?: Visit | null;
  isSubmitting?: boolean;
  isCompleting?: boolean;
  onSubmit: (
    visit: Partial<Visit> & Pick<Visit, 'catIds' | 'reason' | 'scheduledAt'>,
  ) => Promise<void> | void;
  onComplete?: (outcome: VisitOutcome, expenseDraft?: VisitExpenseDraft) => Promise<void> | void;
  onCancelVisit?: () => Promise<void> | void;
  onReopenVisit?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

interface VisitReasonValue {
  reason: VisitReason;
  customReasonLabel: string;
  followUpOfVisitId: string;
  followUpNote: string;
}

interface VisitMoreDetailsValue {
  title: string;
  clinicId: string;
  doctorId: string;
}

interface VisitFormValues {
  catIds: string[];
  scheduledAt: VisitDateTimeValue;
  reasonDetails: VisitReasonValue;
  moreDetails: VisitMoreDetailsValue;
}

const { custom } = FormFactories;

const REASON_OPTIONS = [
  { label: 'Checkup', value: 'checkup' },
  { label: 'Illness', value: 'illness' },
  { label: 'Accident', value: 'accident' },
  { label: 'Vaccination', value: 'vaccination' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Custom', value: 'custom' },
];

interface VisitDateTimeValue {
  date: string;
  time: string;
}

interface VisitDateTimeFieldProps {
  value: VisitDateTimeValue;
  onValueChange: (value: VisitDateTimeValue) => void;
  disabled?: boolean;
}

function VisitDateTimeField({
  value,
  onValueChange,
  disabled,
}: VisitDateTimeFieldProps) {
  const update = (changes: Partial<VisitDateTimeValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <div className='grid grid-cols-2 gap-3'>
      <div className='space-y-1'>
        <Label className='text-sm'>Date</Label>
        <Input
          type='date'
          value={value.date}
          onChange={(event) => update({ date: event.target.value })}
          variant='outline'
          disabled={disabled}
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-sm'>Time</Label>
        <Input
          type='time'
          value={value.time}
          onChange={(event) => update({ time: event.target.value })}
          variant='outline'
          disabled={disabled}
        />
      </div>
    </div>
  );
}

interface VisitReasonFieldProps {
  value: VisitReasonValue;
  onValueChange: (value: VisitReasonValue) => void;
  originalVisitOptions: Array<{ label: string; value: string }>;
  disabled?: boolean;
}

function VisitReasonField({
  value,
  onValueChange,
  originalVisitOptions,
  disabled,
}: VisitReasonFieldProps) {
  const update = (changes: Partial<VisitReasonValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <div className='space-y-3'>
      <Select
        options={REASON_OPTIONS.map((option) => ({
          text: option.label,
          value: option.value,
        }))}
        value={value.reason}
        onChange={(nextReason) => update({ reason: nextReason as VisitReason })}
        disabled={disabled}
      />

      {value.reason === 'custom' && (
        <div className='space-y-1'>
          <Label className='text-sm'>What's the visit for?</Label>
          <Input
            value={value.customReasonLabel}
            onChange={(event) =>
              update({ customReasonLabel: event.target.value })
            }
            placeholder='e.g. Nail trim'
            variant='outline'
            disabled={disabled}
          />
        </div>
      )}

      {value.reason === 'follow_up' && (
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label className='text-sm'>Original visit</Label>
            <Select
              options={originalVisitOptions.map((option) => ({
                text: option.label,
                value: option.value,
              }))}
              value={value.followUpOfVisitId}
              onChange={(nextValue) => update({ followUpOfVisitId: nextValue })}
              placeholder='Select the visit this follows up on'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Follow-up note</Label>
            <Textarea
              rows={2}
              value={value.followUpNote}
              onChange={(event) => update({ followUpNote: event.target.value })}
              variant='outline'
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface VisitMoreDetailsFieldsProps {
  value: VisitMoreDetailsValue;
  onValueChange: (value: VisitMoreDetailsValue) => void;
  clinics: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

function VisitMoreDetailsFields({
  value,
  onValueChange,
  clinics,
  doctors,
  disabled,
}: VisitMoreDetailsFieldsProps) {
  const update = (changes: Partial<VisitMoreDetailsValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <DetailsDisclosure label='More details'>
      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label className='text-sm'>Title override</Label>
          <Input
            value={value.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder='Leave blank for the default title'
            variant='outline'
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Clinic</Label>
          <Select
            options={[
              { text: 'None', value: '' },
              ...clinics.map((clinic) => ({
                text: clinic.name,
                value: clinic.id,
              })),
            ]}
            value={value.clinicId}
            onChange={(nextValue) => update({ clinicId: nextValue })}
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Doctor</Label>
          <Select
            options={[
              { text: 'None', value: '' },
              ...doctors.map((doctor) => ({
                text: doctor.name,
                value: doctor.id,
              })),
            ]}
            value={value.doctorId}
            onChange={(nextValue) => update({ doctorId: nextValue })}
            disabled={disabled}
          />
        </div>
      </div>
    </DetailsDisclosure>
  );
}

interface VisitOutcomeCatValue {
  linkedSymptoms: Symptom[];
  newSymptomDescriptions: string[];
  linkedConditions: CatCondition[];
  newConditionNames: string[];
  newVaccinationNames: string[];
  weight: string;
}

function buildEmptyOutcomeCatValue(): VisitOutcomeCatValue {
  return {
    linkedSymptoms: [],
    newSymptomDescriptions: [''],
    linkedConditions: [],
    newConditionNames: [''],
    newVaccinationNames: [''],
    weight: '',
  };
}

function hasOutcomeCatValueEntries(value: VisitOutcomeCatValue) {
  return (
    value.linkedSymptoms.length > 0 ||
    value.linkedConditions.length > 0 ||
    value.newSymptomDescriptions.some(
      (description) => description.trim().length > 0,
    ) ||
    value.newConditionNames.some((name) => name.trim().length > 0) ||
    value.newVaccinationNames.some((name) => name.trim().length > 0) ||
    value.weight.trim().length > 0
  );
}

interface RepeatableTextInputsProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  disabled?: boolean;
}

/** A list of text inputs the user can add to or remove from, for entries a visit may produce more than one of (e.g. two new symptoms in the same visit). */
function RepeatableTextInputs({
  values,
  onValuesChange,
  placeholder,
  addLabel,
  disabled,
}: RepeatableTextInputsProps) {
  const updateAt = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onValuesChange(next);
  };

  const removeAt = (index: number) => {
    const next = values.filter((_, itemIndex) => itemIndex !== index);
    onValuesChange(next.length > 0 ? next : ['']);
  };

  return (
    <div className='space-y-2'>
      {values.map((value, index) => (
        <div key={index} className='flex items-center gap-2'>
          <div className='flex-1'>
            <Input
              value={value}
              onChange={(event) => updateAt(index, event.target.value)}
              placeholder={placeholder}
              variant='outline'
              disabled={disabled}
            />
          </div>
          {values.length > 1 && (
            <Button
              type='button'
              variant='link'
              size='sm'
              onClick={() => removeAt(index)}
              disabled={disabled}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={() => onValuesChange([...values, ''])}
        disabled={disabled}
      >
        {addLabel}
      </Button>
    </div>
  );
}

/** Reads a cat's symptoms/conditions/weight from the household-wide sync, since a visit's outcome form may need this for several cats at once. */
function useCatOutcomeContext(catId: string) {
  const symptoms = useAppSelector(selectSymptomsByCat(catId), shallowEqual);
  const conditions = useAppSelector(selectConditionsByCat(catId), shallowEqual);
  const weightEntries = useAppSelector(selectWeightEntriesByCat(catId), shallowEqual);

  return { symptoms, conditions, weightEntries };
}

interface VisitOutcomeCatCardProps {
  cat: Cat;
  hasEntries: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** A tappable row summarizing one cat, for drilling into that cat's outcome details. */
function VisitOutcomeCatCard({
  cat,
  hasEntries,
  onClick,
  disabled,
}: VisitOutcomeCatCardProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      className='w-full'
      onClick={onClick}
      disabled={disabled}
    >
      <span className='flex w-full items-center justify-between gap-3'>
        <span className='flex items-center gap-3'>
          <Avatar
            src={cat.photoURL ?? undefined}
            alt={cat.name}
            initials={cat.photoURL ? undefined : getInitials(cat.name)}
            size='sm'
            shape='circle'
          />
          <span className='font-medium'>{cat.name}</span>
        </span>
        <span className='flex items-center gap-2'>
          {hasEntries && (
            <Badge variant='success' size='xs'>
              Added
            </Badge>
          )}
          <ChevronRight className='h-4 w-4 shrink-0' />
        </span>
      </span>
    </Button>
  );
}

interface VisitOutcomeCatDetailProps {
  cat: Cat;
  value: VisitOutcomeCatValue;
  onValueChange: (value: VisitOutcomeCatValue) => void;
  onDone: () => void;
  disabled?: boolean;
}

/** The drill-down screen for one cat's outcome details, reached from `VisitOutcomeCatCard`. */
function VisitOutcomeCatDetail({
  cat,
  value,
  onValueChange,
  onDone,
  disabled,
}: VisitOutcomeCatDetailProps) {
  const { symptoms, conditions, weightEntries } = useCatOutcomeContext(cat.id);
  const openSymptoms = symptoms.filter(
    (symptom) => symptom.resolvedAt === null,
  );
  const openConditions = conditions.filter(
    (condition) => condition.resolvedAt === null,
  );
  const lastWeightEntry = [...weightEntries].sort(
    (left, right) => right.measuredAt - left.measuredAt,
  )[0];

  const update = (changes: Partial<VisitOutcomeCatValue>) =>
    onValueChange({ ...value, ...changes });

  const toggleSymptom = (symptom: Symptom, checked: boolean) => {
    const next = checked
      ? [...value.linkedSymptoms, symptom]
      : value.linkedSymptoms.filter((item) => item.id !== symptom.id);
    update({ linkedSymptoms: next });
  };

  const toggleCondition = (condition: CatCondition, checked: boolean) => {
    const next = checked
      ? [...value.linkedConditions, condition]
      : value.linkedConditions.filter((item) => item.id !== condition.id);
    update({ linkedConditions: next });
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className='gap-1'
          onClick={onDone}
          disabled={disabled}
        >
          <ChevronLeft className='h-4 w-4' />
          Back
        </Button>
      </div>

      <div className='flex items-center gap-3'>
        <Avatar
          src={cat.photoURL ?? undefined}
          alt={cat.name}
          initials={cat.photoURL ? undefined : getInitials(cat.name)}
          size='sm'
          shape='circle'
        />
        <span className='font-medium'>{cat.name}</span>
      </div>

      <div className='space-y-2'>
        <Label className='text-sm'>Symptoms discussed</Label>
        {openSymptoms.length > 0 && (
          <div className='space-y-1'>
            {openSymptoms.map((symptom) => (
              <div key={symptom.id} className='flex items-center gap-2'>
                <Checkbox
                  checked={value.linkedSymptoms.some(
                    (item) => item.id === symptom.id,
                  )}
                  onCheckedChange={(checked) => toggleSymptom(symptom, checked)}
                  disabled={disabled}
                />
                <span className='text-sm'>{symptom.description}</span>
              </div>
            ))}
          </div>
        )}
        <RepeatableTextInputs
          values={value.newSymptomDescriptions}
          onValuesChange={(values) =>
            update({ newSymptomDescriptions: values })
          }
          placeholder={
            openSymptoms.length > 0
              ? 'Or describe a new symptom'
              : 'e.g. Sneezing, low appetite'
          }
          addLabel='Add another symptom'
          disabled={disabled}
        />
      </div>

      <div className='space-y-2'>
        <Label className='text-sm'>Conditions addressed</Label>
        {openConditions.length > 0 && (
          <div className='space-y-1'>
            {openConditions.map((condition) => (
              <div key={condition.id} className='flex items-center gap-2'>
                <Checkbox
                  checked={value.linkedConditions.some(
                    (item) => item.id === condition.id,
                  )}
                  onCheckedChange={(checked) =>
                    toggleCondition(condition, checked)
                  }
                  disabled={disabled}
                />
                <span className='text-sm'>{condition.name}</span>
              </div>
            ))}
          </div>
        )}
        <RepeatableTextInputs
          values={value.newConditionNames}
          onValuesChange={(values) => update({ newConditionNames: values })}
          placeholder={
            openConditions.length > 0
              ? 'Or diagnose a new condition'
              : 'e.g. Dental disease'
          }
          addLabel='Add another condition'
          disabled={disabled}
        />
      </div>

      <div className='space-y-2'>
        <Label className='text-sm'>Vaccinations given</Label>
        <RepeatableTextInputs
          values={value.newVaccinationNames}
          onValuesChange={(values) => update({ newVaccinationNames: values })}
          placeholder='Rabies'
          addLabel='Add another vaccination'
          disabled={disabled}
        />
      </div>

      <div className='space-y-1'>
        <Label className='text-sm'>Current weight</Label>
        <Input
          value={value.weight}
          onChange={(event) => update({ weight: event.target.value })}
          placeholder={
            lastWeightEntry
              ? `${lastWeightEntry.weight} ${lastWeightEntry.unit} last time`
              : '5.4'
          }
          variant='outline'
          disabled={disabled}
        />
      </div>

      <div className='flex justify-end'>
        <Button type='button' onClick={onDone} disabled={disabled}>
          Finish with {cat.name}
        </Button>
      </div>
    </div>
  );
}

type VisitOutcomeReviewItemType =
  'symptom' | 'condition' | 'vaccination' | 'weight';

interface VisitOutcomeReviewItem {
  key: string;
  type: VisitOutcomeReviewItemType;
  catName: string;
  label: string;
  isNew: boolean;
}

function buildVisitOutcome(
  cats: Cat[],
  summary: string,
  catValues: Record<string, VisitOutcomeCatValue>,
): VisitOutcome {
  const outcome: VisitOutcome = {
    summary: summary.trim() || null,
    vaccinations: [],
    weightEntries: [],
    conditions: [],
    symptoms: [],
  };

  cats.forEach((cat) => {
    const catOutcome = catValues[cat.id] ?? buildEmptyOutcomeCatValue();

    catOutcome.linkedSymptoms.forEach((symptom) => {
      outcome.symptoms?.push({
        id: symptom.id,
        catId: cat.id,
        description: symptom.description,
        quickTags: symptom.quickTags,
        firstNoticedAt: symptom.firstNoticedAt,
        severity: symptom.severity,
        linkedConditionId: symptom.linkedConditionId,
        resolvedAt: symptom.resolvedAt,
        createdBy: symptom.createdBy,
        createdAt: symptom.createdAt,
      });
    });

    catOutcome.newSymptomDescriptions
      .map((description) => description.trim())
      .filter((description) => description.length > 0)
      .forEach((description) => {
        outcome.symptoms?.push({
          catId: cat.id,
          description,
          firstNoticedAt: Date.now(),
          quickTags: [],
        });
      });

    catOutcome.linkedConditions.forEach((condition) => {
      outcome.conditions?.push({
        id: condition.id,
        catId: cat.id,
        name: condition.name,
        category: condition.category,
        status: condition.status,
        occurredAt: condition.occurredAt,
        description: condition.description,
        source: condition.source,
        libraryConditionId: condition.libraryConditionId,
        resolvedAt: condition.resolvedAt,
        createdBy: condition.createdBy,
        createdAt: condition.createdAt,
      });
    });

    catOutcome.newConditionNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .forEach((name) => {
        outcome.conditions?.push({
          catId: cat.id,
          name,
          category: 'illness',
          status: 'active',
          occurredAt: Date.now(),
          source: 'custom',
        });
      });

    catOutcome.newVaccinationNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .forEach((name) => {
        outcome.vaccinations?.push({
          catId: cat.id,
          name,
          administeredAt: Date.now(),
        });
      });

    const weight = Number(catOutcome.weight);
    if (catOutcome.weight.trim() && Number.isFinite(weight) && weight > 0) {
      outcome.weightEntries?.push({
        catId: cat.id,
        weight,
        unit: 'lb',
        measuredAt: Date.now(),
      });
    }
  });

  return outcome;
}

function buildReviewItems(
  cats: Cat[],
  outcome: VisitOutcome,
): VisitOutcomeReviewItem[] {
  const catName = (catId: string) =>
    cats.find((cat) => cat.id === catId)?.name ?? 'Cat';

  return [
    ...(outcome.symptoms ?? []).map((symptom, index) => ({
      key: `symptom-${symptom.id ?? index}`,
      type: 'symptom' as const,
      catName: catName(symptom.catId),
      label: symptom.description ?? '',
      isNew: !symptom.id,
    })),
    ...(outcome.conditions ?? []).map((condition, index) => ({
      key: `condition-${condition.id ?? index}`,
      type: 'condition' as const,
      catName: catName(condition.catId),
      label: condition.name,
      isNew: !condition.id,
    })),
    ...(outcome.vaccinations ?? []).map((vaccination, index) => ({
      key: `vaccination-${index}`,
      type: 'vaccination' as const,
      catName: catName(vaccination.catId),
      label: vaccination.name,
      isNew: true,
    })),
    ...(outcome.weightEntries ?? []).map((entry, index) => ({
      key: `weight-${index}`,
      type: 'weight' as const,
      catName: catName(entry.catId),
      label: `${entry.weight} ${entry.unit}`,
      isNew: true,
    })),
  ];
}

function removeReviewItem(
  outcome: VisitOutcome,
  item: VisitOutcomeReviewItem,
): VisitOutcome {
  switch (item.type) {
    case 'symptom':
      return {
        ...outcome,
        symptoms: (outcome.symptoms ?? []).filter(
          (symptom, index) => `symptom-${symptom.id ?? index}` !== item.key,
        ),
      };
    case 'condition':
      return {
        ...outcome,
        conditions: (outcome.conditions ?? []).filter(
          (condition, index) =>
            `condition-${condition.id ?? index}` !== item.key,
        ),
      };
    case 'vaccination':
      return {
        ...outcome,
        vaccinations: (outcome.vaccinations ?? []).filter(
          (_, index) => `vaccination-${index}` !== item.key,
        ),
      };
    case 'weight':
      return {
        ...outcome,
        weightEntries: (outcome.weightEntries ?? []).filter(
          (_, index) => `weight-${index}` !== item.key,
        ),
      };
    default:
      return outcome;
  }
}

const REVIEW_ITEM_TYPE_LABELS: Record<VisitOutcomeReviewItemType, string> = {
  symptom: 'Symptom',
  condition: 'Condition',
  vaccination: 'Vaccination',
  weight: 'Weight',
};

function VisitOutcomeReview({
  outcome,
  cats,
  isSubmitting,
  onBack,
  onRemoveItem,
  onConfirm,
}: {
  outcome: VisitOutcome;
  cats: Cat[];
  isSubmitting: boolean;
  onBack: () => void;
  onRemoveItem: (item: VisitOutcomeReviewItem) => void;
  onConfirm: () => void;
}) {
  const items = buildReviewItems(cats, outcome);

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Here's what will be attached to this visit. Remove anything that doesn't
        belong before finishing.
      </p>

      {items.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Nothing to attach — this visit will be marked completed.
        </p>
      ) : (
        <div className='divide-border divide-y'>
          {items.map((item) => (
            <div
              key={item.key}
              className='flex items-center justify-between gap-3 py-2'
            >
              <div className='min-w-0 text-sm'>
                <span className='text-muted-foreground'>
                  {REVIEW_ITEM_TYPE_LABELS[item.type]} · {item.catName}
                  {item.isNew ? ' · new' : ' · existing'}
                </span>
                <div className='truncate'>{item.label}</div>
              </div>
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={() => onRemoveItem(item)}
                disabled={isSubmitting}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='secondary'
          onClick={onBack}
          disabled={isSubmitting}
        >
          Back
        </Button>
        <Button type='button' onClick={onConfirm} loading={isSubmitting}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function VisitOutcomeExpenseStep({
  visit,
  isSubmitting,
  onSkip,
  onConfirm,
}: {
  visit: Visit;
  isSubmitting: boolean;
  onSkip: () => void;
  onConfirm: (expenseDraft: VisitExpenseDraft) => void;
}) {
  const [items, setItems] = useState<LineItemValue[]>(() => [createEmptyLineItem()]);

  const validItems = items.filter((item) => {
    const amount = Number(item.amount);
    return Number.isFinite(amount) && amount > 0;
  });
  const isValid = validItems.length > 0;

  const handleAdd = () => {
    if (!isValid) {
      return;
    }

    onConfirm({
      catIds: visit.catIds,
      items: validItems.map((item) => ({
        id: item.id,
        category: 'other',
        label: item.label.trim() || null,
        amount: Number(item.amount),
      })),
      incurredAt: visit.completedAt ?? visit.scheduledAt,
      label: null,
    });
  };

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Want to log an expense for this visit? You can always add one later.
      </p>

      <ExpenseLineItemsField value={items} onValueChange={setItems} disabled={isSubmitting} />

      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='secondary'
          onClick={onSkip}
          disabled={isSubmitting}
        >
          Skip
        </Button>
        <Button
          type='button'
          onClick={handleAdd}
          loading={isSubmitting}
          disabled={!isValid}
        >
          {isSubmitting ? 'Completing…' : 'Complete with expense'}
        </Button>
      </div>
    </div>
  );
}

function VisitOutcomeForm({
  visit,
  cats,
  isSubmitting,
  onComplete,
}: {
  visit: Visit;
  cats: Cat[];
  isSubmitting: boolean;
  onComplete: (outcome: VisitOutcome, expenseDraft?: VisitExpenseDraft) => Promise<void> | void;
}) {
  const [summary, setSummary] = useState('');
  const [catValues, setCatValues] = useState<
    Record<string, VisitOutcomeCatValue>
  >(() =>
    Object.fromEntries(
      cats.map((cat) => [cat.id, buildEmptyOutcomeCatValue()]),
    ),
  );
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<VisitOutcome | null>(
    null,
  );
  const [showExpenseStep, setShowExpenseStep] = useState(false);

  const updateCatValue = (catId: string, value: VisitOutcomeCatValue) =>
    setCatValues((current) => ({ ...current, [catId]: value }));

  if (showExpenseStep && pendingOutcome) {
    return (
      <VisitOutcomeExpenseStep
        visit={visit}
        isSubmitting={isSubmitting}
        onSkip={() => void onComplete(pendingOutcome)}
        onConfirm={(expenseDraft) => void onComplete(pendingOutcome, expenseDraft)}
      />
    );
  }

  if (pendingOutcome) {
    return (
      <VisitOutcomeReview
        outcome={pendingOutcome}
        cats={cats}
        isSubmitting={isSubmitting}
        onBack={() => setPendingOutcome(null)}
        onRemoveItem={(item) =>
          setPendingOutcome((current) =>
            current ? removeReviewItem(current, item) : current,
          )
        }
        onConfirm={() => setShowExpenseStep(true)}
      />
    );
  }

  const activeCat = activeCatId
    ? cats.find((cat) => cat.id === activeCatId)
    : undefined;

  if (activeCat) {
    return (
      <VisitOutcomeCatDetail
        cat={activeCat}
        value={catValues[activeCat.id] ?? buildEmptyOutcomeCatValue()}
        onValueChange={(value) => updateCatValue(activeCat.id, value)}
        onDone={() => setActiveCatId(null)}
        disabled={isSubmitting}
      />
    );
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        All fields are optional — skip anything you don't have yet. Tap a cat to
        link existing symptoms and conditions instead of retyping, or add new
        ones.
      </p>

      <div className='space-y-1'>
        <Label className='text-sm'>Visit summary</Label>
        <Textarea
          rows={3}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          variant='outline'
          disabled={isSubmitting}
        />
      </div>

      <div className='space-y-2'>
        {cats.map((cat) => (
          <VisitOutcomeCatCard
            key={cat.id}
            cat={cat}
            hasEntries={hasOutcomeCatValueEntries(
              catValues[cat.id] ?? buildEmptyOutcomeCatValue(),
            )}
            onClick={() => setActiveCatId(cat.id)}
            disabled={isSubmitting}
          />
        ))}
      </div>

      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='secondary'
          onClick={() => {
            setPendingOutcome({});
            setShowExpenseStep(true);
          }}
          disabled={isSubmitting}
        >
          Complete without entries
        </Button>
        <Button
          type='button'
          onClick={() =>
            setPendingOutcome(buildVisitOutcome(cats, summary, catValues))
          }
        >
          Review outcome
        </Button>
      </div>
    </div>
  );
}

function VisitFormModal({
  isOpen,
  cats,
  clinics = [],
  doctors = [],
  visits = [],
  initialVisit,
  isSubmitting = false,
  isCompleting = false,
  onSubmit,
  onComplete,
  onCancelVisit,
  onReopenVisit,
  onDelete,
  onClose,
}: VisitFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialVisit?.id);
  const showOutcome = Boolean(isCompleting && initialVisit && onComplete);
  const formId = initialVisit?.id ?? 'new-nine-lives-visit';
  const [isValid, setIsValid] = useState(
    Boolean((initialVisit?.catIds?.length ?? 0) > 0),
  );
  const originalVisitOptions = useMemo(
    () => getVisitOptions(visits, { excludeVisitId: initialVisit?.id }),
    [visits, initialVisit?.id],
  );
  const defaultClinicAndDoctor = useMemo(() => {
    if (initialVisit) {
      return { clinicId: '', doctorId: '' };
    }

    const mostRecentWithClinic = [...visits]
      .filter((visit) => visit.clinicId)
      .sort((left, right) => right.scheduledAt - left.scheduledAt)[0];

    return {
      clinicId: mostRecentWithClinic?.clinicId ?? '',
      doctorId: mostRecentWithClinic?.doctorId ?? '',
    };
  }, [initialVisit, visits]);
  const clinicSummaries = useMemo(
    () => clinics.map(({ id, name }) => ({ id, name })),
    [clinics],
  );
  const doctorSummaries = useMemo(
    () => doctors.map(({ id, name }) => ({ id, name })),
    [doctors],
  );

  const fields = useMemo(
    () => [
      custom({
        name: 'catIds',
        label: 'Cats',
        renderComponent: (props) => (
          <CatPillSelector
            catOptions={cats.map((cat) => ({ label: cat.name, value: cat.id, photoURL: cat.photoURL }))}
            value={props.value as string[]}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
          />
        ),
        colSpan: 'full',
      }),
      custom({
        name: 'scheduledAt',
        label: 'Date and time',
        renderComponent: (props) => (
          <VisitDateTimeField
            value={props.value as VisitDateTimeValue}
            onValueChange={(value) => props.onValueChange(value)}
            disabled={props.disabled}
          />
        ),
      }),
      custom({
        name: 'reasonDetails',
        label: 'Reason',
        renderComponent: (props) => (
          <VisitReasonField
            value={props.value as VisitReasonValue}
            onValueChange={(value) => props.onValueChange(value)}
            originalVisitOptions={originalVisitOptions}
            disabled={props.disabled}
          />
        ),
      }),
      custom({
        name: 'moreDetails',
        label: '',
        renderComponent: (props) => (
          <VisitMoreDetailsFields
            value={props.value as VisitMoreDetailsValue}
            onValueChange={(value) => props.onValueChange(value)}
            clinics={clinicSummaries}
            doctors={doctorSummaries}
            disabled={props.disabled}
          />
        ),
        colSpan: 'full',
      }),
    ],
    [cats, originalVisitOptions, clinicSummaries, doctorSummaries],
  );

  const handleSubmit = async (data: VisitFormValues) => {
    const scheduledAt = fromLocalDateAndTimeInputValues(
      data.scheduledAt.date,
      data.scheduledAt.time,
    );
    if (!scheduledAt || data.catIds.length === 0) {
      return;
    }

    await onSubmit({
      id: initialVisit?.id,
      catIds: data.catIds,
      scheduledAt,
      reason: data.reasonDetails.reason,
      customReasonLabel: data.reasonDetails.customReasonLabel.trim() || null,
      followUpOfVisitId: data.reasonDetails.followUpOfVisitId || null,
      followUpNote: data.reasonDetails.followUpNote.trim() || null,
      title: data.moreDetails.title.trim() || null,
      clinicId: data.moreDetails.clinicId || null,
      doctorId: data.moreDetails.doctorId || null,
    });
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete visit',
      message:
        'Are you sure you want to delete this visit? Follow-up links will be cleared.',
      destructive: true,
    });
    if (confirmed) {
      await onDelete();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={showOutcome ? 'Complete visit' : 'Visit'}
    >
      {showOutcome ? (
        <VisitOutcomeForm
          visit={initialVisit!}
          cats={cats.filter((cat) => initialVisit?.catIds.includes(cat.id))}
          isSubmitting={isSubmitting}
          onComplete={onComplete!}
        />
      ) : (
        <Form
          key={formId}
          id={formId}
          form={fields}
          initialData={{
            catIds: initialVisit?.catIds ?? [],
            scheduledAt: {
              date: toLocalDateInputValue(initialVisit?.scheduledAt),
              time: toLocalTimeInputValue(initialVisit?.scheduledAt),
            },
            reasonDetails: {
              reason: initialVisit?.reason ?? 'checkup',
              customReasonLabel: initialVisit?.customReasonLabel ?? '',
              followUpOfVisitId: initialVisit?.followUpOfVisitId ?? '',
              followUpNote: initialVisit?.followUpNote ?? '',
            },
            moreDetails: {
              title: initialVisit?.title ?? '',
              clinicId:
                initialVisit?.clinicId ?? defaultClinicAndDoctor.clinicId,
              doctorId:
                initialVisit?.doctorId ?? defaultClinicAndDoctor.doctorId,
            },
          }}
          columns={1}
          spacing='normal'
          onDataChange={(data) => {
            setIsValid(Boolean((data as VisitFormValues).catIds.length > 0));
          }}
          onSubmit={(data) => {
            void handleSubmit(data as VisitFormValues);
          }}
          submitButton={
            <ModalFooterActions
              leftActions={
                <>
                  {isEditing && onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />}
                  {isEditing && onCancelVisit && initialVisit?.status === 'upcoming' && (
                    <Button type='button' variant='secondary' onClick={() => void onCancelVisit()} disabled={isSubmitting}>
                      Cancel visit
                    </Button>
                  )}
                  {isEditing && onReopenVisit && initialVisit?.status === 'cancelled' && (
                    <Button type='button' variant='secondary' onClick={() => void onReopenVisit()} disabled={isSubmitting}>
                      Reopen visit
                    </Button>
                  )}
                </>
              }
              rightActions={
                <>
                  <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                    Close
                  </Button>
                  <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                    {isSubmitting ? 'Saving…' : isEditing ? 'Save visit' : 'Schedule visit'}
                  </Button>
                </>
              }
            />
          }
        />
      )}
    </Modal>
  );
}

export default VisitFormModal;
