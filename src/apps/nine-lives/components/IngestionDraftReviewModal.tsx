import { useState, type ReactNode } from 'react';

import {
  Button,
  Disclosure,
  DropdownMenu,
  DropdownMenuFactories,
  Input,
  Modal,
  Select,
  Toggle,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Activity,
  Calendar,
  Cat as CatIcon,
  Check,
  ChevronDown,
  Hospital,
  Pencil,
  Pill,
  Plus,
  Receipt,
  Scale,
  Stethoscope,
  Syringe,
  X,
  type LucideIcon,
} from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { formatDateTime } from '@/utils/formatUtils';

import {
  confirmIngestionDraft,
  discardIngestionDraft,
  updateIngestionDraft,
  type IngestionDraftSelections,
} from '../store/actions/ingestionDraftsActions';
import { selectCatsByHousehold, selectClinicsByHousehold } from '../store/selectors';
import { DEFAULT_EXPENSE_CATEGORIES, getExpenseCategoryLabel } from '../utils/budgetCalculators';
import type { Cat, CatSex, HealthRecordType, IngestionDraft, VisitReason } from '../types';

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

/** Same thresholds/tokens as other confidence-style indicators in this app (see StatsSummary). */
function getConfidenceClassName(confidence: number): string {
  if (confidence >= 0.8) {
    return 'text-success';
  }

  if (confidence >= 0.5) {
    return 'text-warning';
  }

  return 'text-destructive';
}

/** Changing just the date half of a timestamp, keeping its existing time-of-day. */
function withUpdatedDate(current: number, dateValue: string): number | undefined {
  return fromLocalDateAndTimeInputValues(dateValue, toLocalTimeInputValue(current));
}

/** Changing just the time half of a timestamp, keeping its existing date. */
function withUpdatedTime(current: number, timeValue: string): number | undefined {
  return fromLocalDateAndTimeInputValues(toLocalDateInputValue(current), timeValue);
}

const SEX_OPTIONS = [
  { text: 'Unknown', value: 'unknown' },
  { text: 'Male', value: 'male' },
  { text: 'Female', value: 'female' },
];

const REASON_OPTIONS = [
  { text: 'Checkup', value: 'checkup' },
  { text: 'Illness', value: 'illness' },
  { text: 'Accident', value: 'accident' },
  { text: 'Vaccination', value: 'vaccination' },
  { text: 'Follow-up', value: 'follow_up' },
  { text: 'Custom', value: 'custom' },
];

const RECORD_TYPE_OPTIONS: { text: string; value: Exclude<HealthRecordType, 'custom'> }[] = [
  { text: 'Vet paperwork', value: 'vet_paperwork' },
  { text: 'Lab result', value: 'lab_result' },
  { text: 'Insurance', value: 'insurance' },
  { text: 'Shelter / adoption', value: 'shelter_adoption' },
  { text: 'Prescription', value: 'prescription' },
  { text: 'Microchip registration', value: 'microchip_registration' },
  { text: 'Miscellaneous', value: 'miscellaneous' },
];

interface IngestionDraftReviewModalProps {
  isOpen: boolean;
  householdId: string;
  uid: string;
  draft: IngestionDraft;
  file: File | null;
  intent?: 'expense' | 'record';
  onClose: () => void;
}

type ReviewSection =
  | 'cat'
  | 'clinic'
  | 'visit'
  | 'vaccinations'
  | 'preventives'
  | 'weight'
  | 'symptoms'
  | 'conditions'
  | 'expense';

const SECTION_LABELS: Record<ReviewSection, string> = {
  cat: 'Cats',
  clinic: 'Clinics',
  visit: 'Visits',
  vaccinations: 'Vaccinations',
  preventives: 'Preventives',
  weight: 'Weight',
  symptoms: 'Symptoms',
  conditions: 'Conditions',
  expense: 'Expenses',
};

const SECTION_SINGULAR_LABELS: Record<ReviewSection, string> = {
  cat: 'Cat',
  clinic: 'Vet clinic',
  visit: 'Visit',
  vaccinations: 'Vaccination',
  preventives: 'Preventive',
  weight: 'Weight entry',
  symptoms: 'Symptom',
  conditions: 'Condition',
  expense: 'Expense',
};

const SECTION_ICONS: Record<ReviewSection, LucideIcon> = {
  cat: CatIcon,
  clinic: Hospital,
  visit: Calendar,
  vaccinations: Syringe,
  preventives: Pill,
  weight: Scale,
  symptoms: Activity,
  conditions: Stethoscope,
  expense: Receipt,
};

type ArrayIncludeKey =
  | 'includeCats'
  | 'includeClinics'
  | 'includeVisits'
  | 'includeVaccinations'
  | 'includePreventives'
  | 'includeWeightEntries'
  | 'includeSymptoms'
  | 'includeConditions'
  | 'includeExpenses';

interface EditingKey {
  section: 'visit' | 'vaccination' | 'preventive' | 'weight' | 'symptom' | 'condition' | 'expense';
  index: number;
}

function blankCat(): IngestionDraft['proposedCats'][number] {
  return { name: '', breed: null, dateOfBirth: null, isDateOfBirthEstimated: null, sex: null };
}
function blankClinic(): IngestionDraft['proposedClinics'][number] {
  return { name: '', phone: null, email: null, website: null, address: null };
}
function blankVisit(): IngestionDraft['proposedVisits'][number] {
  return { catNames: [], clinicName: null, scheduledAt: Date.now(), reason: 'checkup', customReasonLabel: null, notes: null };
}
function blankVaccination(): IngestionDraft['proposedVaccinations'][number] {
  return { catName: null, name: '', administeredAt: Date.now(), expiresAt: null, lotNumber: null };
}
function blankPreventive(): IngestionDraft['proposedPreventives'][number] {
  return { catNames: [], name: '', type: 'other', administeredAt: Date.now(), expiresAt: null, dosage: null };
}
function blankWeight(): IngestionDraft['proposedWeightEntries'][number] {
  return { catName: null, weight: 0, unit: 'lb', measuredAt: Date.now() };
}
function blankSymptom(): IngestionDraft['proposedSymptoms'][number] {
  return { catName: null, description: '', quickTags: [], firstNoticedAt: Date.now(), severity: null };
}
function blankCondition(): IngestionDraft['proposedConditions'][number] {
  return { catName: null, name: '', category: 'illness', status: 'active', occurredAt: Date.now(), description: null };
}
function blankExpense(): IngestionDraft['proposedExpenses'][number] {
  return { catNames: [], items: [{ category: 'other', label: null, amount: 0 }], incurredAt: Date.now(), notes: null };
}

function IncludeToggle({
  included,
  onToggle,
  label = 'Include',
  disabled = false,
}: {
  included: boolean;
  onToggle: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className='flex items-center gap-2 text-sm'>
      <Toggle size='sm' checked={included} onCheckedChange={onToggle} disabled={disabled} />
      {label}
    </label>
  );
}

function EditPencilButton({ editing, onClick }: { editing: boolean; onClick: () => void }) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='icon'
      aria-label={editing ? 'Done editing' : 'Edit'}
      onClick={onClick}
      className='bg-transparent'
    >
      {editing ? <Check className='h-4 w-4' /> : <Pencil className='h-4 w-4' />}
    </Button>
  );
}

/** Chip list of attached cat names with remove buttons, plus a reveal-link to append another existing cat. */
function CatNamesEditor({
  catNames,
  cats,
  onChange,
}: {
  catNames: string[];
  cats: Cat[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const availableToAdd = cats.filter(
    (cat) => !catNames.some((name) => name.toLowerCase() === cat.name.toLowerCase()),
  );

  return (
    <div className='space-y-1'>
      {catNames.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {catNames.map((name, index) => (
            <span
              key={`${name}-${index}`}
              className='inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs'
            >
              {name}
              <button
                type='button'
                aria-label={`Remove ${name}`}
                onClick={() => onChange(catNames.filter((_, i) => i !== index))}
              >
                <X className='h-3 w-3' />
              </button>
            </span>
          ))}
        </div>
      )}
      {adding ? (
        <Select
          options={availableToAdd.map((cat) => ({ text: cat.name, value: cat.name }))}
          value=''
          placeholder='Select a cat to add'
          onChange={(value) => {
            if (value) {
              onChange([...catNames, value]);
            }
            setAdding(false);
          }}
        />
      ) : (
        availableToAdd.length > 0 && (
          <Button type='button' variant='link' size='sm' className={mutedLinkClassName} onClick={() => setAdding(true)}>
            + Add cat
          </Button>
        )
      )}
    </div>
  );
}

/** For proposals that attach to exactly one cat — keeps the current name selectable even if it's not (yet) a household cat. */
function SingleCatSelect({
  catName,
  cats,
  onChange,
}: {
  catName: string | null;
  cats: Cat[];
  onChange: (name: string | null) => void;
}) {
  const options = [
    ...cats.map((cat) => ({ text: cat.name, value: cat.name })),
    ...(catName && !cats.some((cat) => cat.name.toLowerCase() === catName.toLowerCase())
      ? [{ text: catName, value: catName }]
      : []),
  ];

  return (
    <Select
      options={options}
      value={catName ?? ''}
      placeholder='Select a cat'
      onChange={(value) => onChange(value || null)}
    />
  );
}

function ReviewProgressPills({
  sections,
  reviewed,
  expanded,
  onSelect,
}: {
  sections: ReviewSection[];
  reviewed: Set<ReviewSection>;
  expanded: ReviewSection | null;
  onSelect: (section: ReviewSection) => void;
}) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      {sections.map((section) => {
        const isActive = expanded === section;
        const isReviewed = reviewed.has(section);
        const Icon = SECTION_ICONS[section];
        return (
          <button
            key={section}
            type='button'
            onClick={() => onSelect(section)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : isReviewed
                  ? 'border-border bg-muted text-foreground'
                  : 'border-border text-muted-foreground'
            }`}
          >
            <Icon className='h-3 w-3' /> {SECTION_LABELS[section]}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  section,
  expanded,
  onToggle,
  children,
}: {
  title: ReactNode;
  section: ReviewSection;
  expanded: ReviewSection | null;
  onToggle: (section: ReviewSection) => void;
  children: ReactNode;
}) {
  const Icon = SECTION_ICONS[section];

  return (
    <div className='rounded-lg border-2 border-border'>
      <Disclosure
        label={
          <span className='flex items-center gap-2 font-medium'>
            <Icon className='h-4 w-4' /> {title}
          </span>
        }
        isOpen={expanded === section}
        onToggle={() => onToggle(section)}
        buttonClassName='w-full px-3 py-2.5 hover:bg-muted/40'
        className='overflow-visible'
      >
        <div className='space-y-3 border-t-2 border-border bg-muted/20 p-3'>{children}</div>
      </Disclosure>
    </div>
  );
}

function IngestionDraftReviewModal({
  isOpen,
  householdId,
  uid,
  draft,
  file,
  intent,
  onClose,
}: IngestionDraftReviewModalProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const clinics = useAppSelector(selectClinicsByHousehold(householdId), shallowEqual);

  const sectionsWithContent: ReviewSection[] = [
    ...(draft.proposedCats.length ? (['cat'] as const) : []),
    ...(draft.proposedClinics.length ? (['clinic'] as const) : []),
    ...(draft.proposedVisits.length ? (['visit'] as const) : []),
    ...(draft.proposedVaccinations.length ? (['vaccinations'] as const) : []),
    ...(draft.proposedPreventives.length ? (['preventives'] as const) : []),
    ...(draft.proposedWeightEntries.length ? (['weight'] as const) : []),
    ...(draft.proposedSymptoms.length ? (['symptoms'] as const) : []),
    ...(draft.proposedConditions.length ? (['conditions'] as const) : []),
    ...(draft.proposedExpenses.length ? (['expense'] as const) : []),
  ];
  const initialSection: ReviewSection | null =
    intent === 'expense' && draft.proposedExpenses.length ? 'expense' : (sectionsWithContent[0] ?? null);

  const [expanded, setExpanded] = useState<ReviewSection | null>(initialSection);
  const [reviewed, setReviewed] = useState<Set<ReviewSection>>(
    new Set(initialSection ? [initialSection] : []),
  );
  const [editing, setEditing] = useState<EditingKey | null>(null);
  const [editingVisitNotes, setEditingVisitNotes] = useState<Set<number>>(new Set());
  const [pickingExisting, setPickingExisting] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<IngestionDraftSelections>({
    saveAsRecord: draft.suggestKeepAsRecord,
  });
  const [recordType, setRecordType] = useState<Exclude<HealthRecordType, 'custom'>>(
    draft.proposedRecordType ?? 'vet_paperwork',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSection = (section: ReviewSection) => {
    setExpanded((current) => (current === section ? null : section));
    setReviewed((current) => new Set(current).add(section));
  };

  const isEditing = (section: EditingKey['section'], index: number) =>
    editing?.section === section && editing.index === index;
  const toggleEditing = (section: EditingKey['section'], index: number) => {
    setEditing((current) =>
      current && current.section === section && current.index === index ? null : { section, index },
    );
  };

  const isEditingVisitNotes = (index: number) => editingVisitNotes.has(index);
  const startEditingVisitNotes = (index: number) =>
    setEditingVisitNotes((current) => new Set(current).add(index));

  const isPickingExisting = (section: 'cat' | 'clinic', index: number) =>
    pickingExisting.has(`${section}-${index}`);
  const startPickingExisting = (section: 'cat' | 'clinic', index: number) =>
    setPickingExisting((current) => new Set(current).add(`${section}-${index}`));
  const stopPickingExisting = (section: 'cat' | 'clinic', index: number) => {
    setPickingExisting((current) => {
      const next = new Set(current);
      next.delete(`${section}-${index}`);
      return next;
    });
    const key = section === 'cat' ? 'catIds' : 'clinicIds';
    setSelections((current) => {
      const values = [...(current[key] ?? [])];
      values[index] = null;
      return { ...current, [key]: values };
    });
  };

  const toggleArrayInclude = (key: ArrayIncludeKey, index: number) => {
    setSelections((current) => {
      const values = [...(current[key] ?? [])];
      values[index] = values[index] !== false ? false : true;
      return { ...current, [key]: values };
    });
  };
  const isIncluded = (key: ArrayIncludeKey, index: number) => selections[key]?.[index] !== false;

  const updateDraft = (changes: Parameters<typeof updateIngestionDraft>[0]['changes']) =>
    void dispatch(updateIngestionDraft({ householdId, draftId: draft.id, changes }));

  const updateCatAt = (index: number, patch: Partial<IngestionDraft['proposedCats'][number]>) =>
    updateDraft({
      proposedCats: draft.proposedCats.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateClinicAt = (index: number, patch: Partial<IngestionDraft['proposedClinics'][number]>) =>
    updateDraft({
      proposedClinics: draft.proposedClinics.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateVisitAt = (index: number, patch: Partial<IngestionDraft['proposedVisits'][number]>) =>
    updateDraft({
      proposedVisits: draft.proposedVisits.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateVaccinationAt = (
    index: number,
    patch: Partial<IngestionDraft['proposedVaccinations'][number]>,
  ) =>
    updateDraft({
      proposedVaccinations: draft.proposedVaccinations.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  const updatePreventiveAt = (
    index: number,
    patch: Partial<IngestionDraft['proposedPreventives'][number]>,
  ) =>
    updateDraft({
      proposedPreventives: draft.proposedPreventives.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  const updateWeightAt = (index: number, patch: Partial<IngestionDraft['proposedWeightEntries'][number]>) =>
    updateDraft({
      proposedWeightEntries: draft.proposedWeightEntries.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  const updateSymptomAt = (index: number, patch: Partial<IngestionDraft['proposedSymptoms'][number]>) =>
    updateDraft({
      proposedSymptoms: draft.proposedSymptoms.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateConditionAt = (index: number, patch: Partial<IngestionDraft['proposedConditions'][number]>) =>
    updateDraft({
      proposedConditions: draft.proposedConditions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateExpenseAt = (index: number, patch: Partial<IngestionDraft['proposedExpenses'][number]>) =>
    updateDraft({
      proposedExpenses: draft.proposedExpenses.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const updateExpenseItemAt = (
    expenseIndex: number,
    itemIndex: number,
    patch: Partial<IngestionDraft['proposedExpenses'][number]['items'][number]>,
  ) => {
    const expense = draft.proposedExpenses[expenseIndex];
    updateExpenseAt(expenseIndex, {
      items: expense.items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)),
    });
  };

  const addBlankItem = (section: ReviewSection) => {
    switch (section) {
      case 'cat':
        updateDraft({ proposedCats: [...draft.proposedCats, blankCat()] });
        break;
      case 'clinic':
        updateDraft({ proposedClinics: [...draft.proposedClinics, blankClinic()] });
        break;
      case 'visit':
        updateDraft({ proposedVisits: [...draft.proposedVisits, blankVisit()] });
        setEditing({ section: 'visit', index: draft.proposedVisits.length });
        break;
      case 'vaccinations':
        updateDraft({ proposedVaccinations: [...draft.proposedVaccinations, blankVaccination()] });
        setEditing({ section: 'vaccination', index: draft.proposedVaccinations.length });
        break;
      case 'preventives':
        updateDraft({ proposedPreventives: [...draft.proposedPreventives, blankPreventive()] });
        setEditing({ section: 'preventive', index: draft.proposedPreventives.length });
        break;
      case 'weight':
        updateDraft({ proposedWeightEntries: [...draft.proposedWeightEntries, blankWeight()] });
        setEditing({ section: 'weight', index: draft.proposedWeightEntries.length });
        break;
      case 'symptoms':
        updateDraft({ proposedSymptoms: [...draft.proposedSymptoms, blankSymptom()] });
        setEditing({ section: 'symptom', index: draft.proposedSymptoms.length });
        break;
      case 'conditions':
        updateDraft({ proposedConditions: [...draft.proposedConditions, blankCondition()] });
        setEditing({ section: 'condition', index: draft.proposedConditions.length });
        break;
      case 'expense':
        updateDraft({ proposedExpenses: [...draft.proposedExpenses, blankExpense()] });
        setEditing({ section: 'expense', index: draft.proposedExpenses.length });
        break;
    }
    setExpanded(section);
    setReviewed((current) => new Set(current).add(section));
  };

  const totalCount =
    draft.proposedCats.length +
    draft.proposedClinics.length +
    draft.proposedVisits.length +
    draft.proposedVaccinations.length +
    draft.proposedPreventives.length +
    draft.proposedWeightEntries.length +
    draft.proposedSymptoms.length +
    draft.proposedConditions.length +
    draft.proposedExpenses.length;
  const includedCount =
    draft.proposedCats.filter((_, i) => isIncluded('includeCats', i)).length +
    draft.proposedClinics.filter((_, i) => isIncluded('includeClinics', i)).length +
    draft.proposedVisits.filter((_, i) => isIncluded('includeVisits', i)).length +
    draft.proposedVaccinations.filter((_, i) => isIncluded('includeVaccinations', i)).length +
    draft.proposedPreventives.filter((_, i) => isIncluded('includePreventives', i)).length +
    draft.proposedWeightEntries.filter((_, i) => isIncluded('includeWeightEntries', i)).length +
    draft.proposedSymptoms.filter((_, i) => isIncluded('includeSymptoms', i)).length +
    draft.proposedConditions.filter((_, i) => isIncluded('includeConditions', i)).length +
    draft.proposedExpenses.filter((_, i) => isIncluded('includeExpenses', i)).length;

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await dispatch(
        updateIngestionDraft({ householdId, draftId: draft.id, changes: { proposedRecordType: recordType } }),
      ).unwrap();
      await dispatch(
        confirmIngestionDraft({
          householdId,
          draftId: draft.id,
          uid,
          selections,
          file,
        }),
      ).unwrap();
      onClose();
    } catch (submissionError) {
      setError(typeof submissionError === 'string' ? submissionError : 'Unable to confirm this document.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    const confirmed = await confirm({
      title: 'Discard document',
      message: 'Are you sure you want to discard this document? Nothing will be saved.',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(discardIngestionDraft({ householdId, draftId: draft.id })).unwrap();
      onClose();
    } catch (discardError) {
      setError(typeof discardError === 'string' ? discardError : 'Unable to discard this document.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { option } = DropdownMenuFactories;
  const addItemMenuItems = (Object.keys(SECTION_LABELS) as ReviewSection[]).map((section) =>
    option({ label: SECTION_SINGULAR_LABELS[section], value: section }),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Review extracted records'
      className='w-full sm:min-w-xl sm:max-w-2xl'
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {draft.sourceFileName}
          {draft.confidence !== null && (
            <>
              {' · '}
              <span className={getConfidenceClassName(draft.confidence)}>
                {Math.round(draft.confidence * 100)}% confidence
              </span>
            </>
          )}
        </p>
        <p className='text-muted-foreground text-xs'>
          Extracted as of{' '}
          {new Date(draft.createdAt).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
          {' '}
          — only events on or before this date were proposed.
        </p>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <ReviewProgressPills
            sections={sectionsWithContent}
            reviewed={reviewed}
            expanded={expanded}
            onSelect={toggleSection}
          />
          <DropdownMenu
            items={addItemMenuItems}
            onItemSelect={(value) => addBlankItem(value as ReviewSection)}
            placement='bottom'
            alignment='end'
            offset={8}
            trigger={
              <Button type='button' variant='link' size='sm' className={`${mutedLinkClassName} gap-1`}>
                <Plus className='h-3.5 w-3.5' /> Add item <ChevronDown className='h-3.5 w-3.5' />
              </Button>
            }
          />
        </div>
      </div>

      <div className='mt-3 max-h-[65vh] min-h-[40vh] space-y-3 overflow-y-auto pr-1'>
        {draft.proposedCats.length > 0 && (
          <Section title='Cats' section='cat' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedCats.map((cat, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <IncludeToggle included={isIncluded('includeCats', index)} onToggle={() => toggleArrayInclude('includeCats', index)} />
                {isPickingExisting('cat', index) ? (
                  <>
                    <Select
                      options={cats.map((existingCat) => ({ text: existingCat.name, value: existingCat.id }))}
                      value={selections.catIds?.[index] ?? ''}
                      placeholder='Select an existing cat'
                      onChange={(value) =>
                        setSelections((current) => {
                          const values = [...(current.catIds ?? [])];
                          values[index] = value || null;
                          return { ...current, catIds: values };
                        })
                      }
                    />
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className={mutedLinkClassName}
                      onClick={() => stopPickingExisting('cat', index)}
                    >
                      Enter a new name instead
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={cat.name}
                      aria-label='Proposed cat name'
                      placeholder='Cat name'
                      onChange={(event) => updateCatAt(index, { name: event.target.value })}
                    />
                    <div className='grid grid-cols-2 gap-2'>
                      <Input
                        value={cat.breed ?? ''}
                        placeholder='Breed'
                        onChange={(event) => updateCatAt(index, { breed: event.target.value || null })}
                      />
                      <Select
                        options={SEX_OPTIONS}
                        value={cat.sex ?? 'unknown'}
                        onChange={(value) => updateCatAt(index, { sex: value as CatSex })}
                      />
                    </div>
                    {cats.length > 0 && (
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        className={mutedLinkClassName}
                        onClick={() => startPickingExisting('cat', index)}
                      >
                        Choose from existing instead
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedClinics.length > 0 && (
          <Section title='Vet clinics' section='clinic' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedClinics.map((clinic, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <IncludeToggle included={isIncluded('includeClinics', index)} onToggle={() => toggleArrayInclude('includeClinics', index)} />
                {isPickingExisting('clinic', index) ? (
                  <>
                    <Select
                      options={clinics.map((existingClinic) => ({ text: existingClinic.name, value: existingClinic.id }))}
                      value={selections.clinicIds?.[index] ?? ''}
                      placeholder='Select an existing clinic'
                      onChange={(value) =>
                        setSelections((current) => {
                          const values = [...(current.clinicIds ?? [])];
                          values[index] = value || null;
                          return { ...current, clinicIds: values };
                        })
                      }
                    />
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className={mutedLinkClassName}
                      onClick={() => stopPickingExisting('clinic', index)}
                    >
                      Enter a new name instead
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={clinic.name}
                      aria-label='Proposed clinic name'
                      placeholder='Clinic name'
                      onChange={(event) => updateClinicAt(index, { name: event.target.value })}
                    />
                    <div className='grid grid-cols-2 gap-2'>
                      <Input
                        value={clinic.phone ?? ''}
                        placeholder='Phone'
                        onChange={(event) => updateClinicAt(index, { phone: event.target.value || null })}
                      />
                      <Input
                        value={clinic.email ?? ''}
                        placeholder='Email'
                        onChange={(event) => updateClinicAt(index, { email: event.target.value || null })}
                      />
                    </div>
                    <Input
                      value={clinic.address ?? ''}
                      placeholder='Address'
                      onChange={(event) => updateClinicAt(index, { address: event.target.value || null })}
                    />
                    {clinics.length > 0 && (
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        className={mutedLinkClassName}
                        onClick={() => startPickingExisting('clinic', index)}
                      >
                        Choose from existing instead
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedVisits.length > 0 && (
          <Section title='Visits' section='visit' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedVisits.map((visit, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <IncludeToggle included={isIncluded('includeVisits', index)} onToggle={() => toggleArrayInclude('includeVisits', index)} />
                  <EditPencilButton editing={isEditing('visit', index)} onClick={() => toggleEditing('visit', index)} />
                </div>
                {isEditing('visit', index) ? (
                  <div className='space-y-2'>
                    <div className='flex flex-col gap-2 sm:flex-row'>
                      <Input
                        type='date'
                        value={toLocalDateInputValue(visit.scheduledAt)}
                        onChange={(event) => {
                          const scheduledAt = withUpdatedDate(visit.scheduledAt, event.target.value);
                          if (scheduledAt !== undefined) {
                            updateVisitAt(index, { scheduledAt });
                          }
                        }}
                      />
                      <Input
                        type='time'
                        value={toLocalTimeInputValue(visit.scheduledAt)}
                        onChange={(event) => {
                          const scheduledAt = withUpdatedTime(visit.scheduledAt, event.target.value);
                          if (scheduledAt !== undefined) {
                            updateVisitAt(index, { scheduledAt });
                          }
                        }}
                      />
                      <Select
                        options={REASON_OPTIONS}
                        value={visit.reason}
                        onChange={(value) => updateVisitAt(index, { reason: value as VisitReason })}
                      />
                    </div>
                    {visit.reason === 'custom' && (
                      <Input
                        value={visit.customReasonLabel ?? ''}
                        placeholder='Custom reason'
                        onChange={(event) => updateVisitAt(index, { customReasonLabel: event.target.value || null })}
                      />
                    )}
                    <Input
                      value={visit.clinicName ?? ''}
                      placeholder='Clinic name'
                      onChange={(event) => updateVisitAt(index, { clinicName: event.target.value || null })}
                    />
                    <CatNamesEditor
                      catNames={visit.catNames}
                      cats={cats}
                      onChange={(catNames) => updateVisitAt(index, { catNames })}
                    />
                  </div>
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    {formatDateTime(visit.scheduledAt)} · {visit.reason}
                    {visit.catNames.length > 0 && ` · ${visit.catNames.join(', ')}`}
                    {visit.clinicName && ` · ${visit.clinicName}`}
                  </p>
                )}
                {isEditingVisitNotes(index) ? (
                  <Input
                    value={visit.notes ?? ''}
                    placeholder='Visit notes'
                    onChange={(event) => updateVisitAt(index, { notes: event.target.value })}
                  />
                ) : (
                  <div className='space-y-1'>
                    {visit.notes && <p className='text-sm'>{visit.notes}</p>}
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className={mutedLinkClassName}
                      onClick={() => startEditingVisitNotes(index)}
                    >
                      {visit.notes ? 'Edit notes' : '+ Add notes'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedVaccinations.length > 0 && (
          <Section title='Vaccinations' section='vaccinations' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedVaccinations.map((item, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <IncludeToggle included={isIncluded('includeVaccinations', index)} onToggle={() => toggleArrayInclude('includeVaccinations', index)} />
                  <EditPencilButton
                    editing={isEditing('vaccination', index)}
                    onClick={() => toggleEditing('vaccination', index)}
                  />
                </div>
                {isEditing('vaccination', index) ? (
                  <div className='space-y-2'>
                    <div className='flex flex-col gap-2 sm:flex-row'>
                      <Input
                        value={item.name}
                        aria-label='Vaccination name'
                        onChange={(event) => updateVaccinationAt(index, { name: event.target.value })}
                      />
                      <Input
                        type='date'
                        value={toLocalDateInputValue(item.administeredAt)}
                        onChange={(event) => {
                          const administeredAt = withUpdatedDate(item.administeredAt, event.target.value);
                          if (administeredAt !== undefined) {
                            updateVaccinationAt(index, { administeredAt });
                          }
                        }}
                      />
                      <Input
                        type='time'
                        value={toLocalTimeInputValue(item.administeredAt)}
                        onChange={(event) => {
                          const administeredAt = withUpdatedTime(item.administeredAt, event.target.value);
                          if (administeredAt !== undefined) {
                            updateVaccinationAt(index, { administeredAt });
                          }
                        }}
                      />
                    </div>
                    <SingleCatSelect
                      catName={item.catName}
                      cats={cats}
                      onChange={(catName) => updateVaccinationAt(index, { catName })}
                    />
                  </div>
                ) : (
                  <span>
                    {item.name} · {formatDateTime(item.administeredAt)}
                    {item.catName && ` · ${item.catName}`}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedPreventives.length > 0 && (
          <Section title='Preventives' section='preventives' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedPreventives.map((item, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <IncludeToggle included={isIncluded('includePreventives', index)} onToggle={() => toggleArrayInclude('includePreventives', index)} />
                  <EditPencilButton
                    editing={isEditing('preventive', index)}
                    onClick={() => toggleEditing('preventive', index)}
                  />
                </div>
                {isEditing('preventive', index) ? (
                  <div className='space-y-2'>
                    <div className='flex flex-col gap-2 sm:flex-row'>
                      <Input
                        value={item.name}
                        aria-label='Preventive name'
                        onChange={(event) => updatePreventiveAt(index, { name: event.target.value })}
                      />
                      <Input
                        type='date'
                        value={toLocalDateInputValue(item.administeredAt)}
                        onChange={(event) => {
                          const administeredAt = withUpdatedDate(item.administeredAt, event.target.value);
                          if (administeredAt !== undefined) {
                            updatePreventiveAt(index, { administeredAt });
                          }
                        }}
                      />
                      <Input
                        type='time'
                        value={toLocalTimeInputValue(item.administeredAt)}
                        onChange={(event) => {
                          const administeredAt = withUpdatedTime(item.administeredAt, event.target.value);
                          if (administeredAt !== undefined) {
                            updatePreventiveAt(index, { administeredAt });
                          }
                        }}
                      />
                    </div>
                    <CatNamesEditor
                      catNames={item.catNames}
                      cats={cats}
                      onChange={(catNames) => updatePreventiveAt(index, { catNames })}
                    />
                  </div>
                ) : (
                  <span>
                    {item.name} · {formatDateTime(item.administeredAt)}
                    {item.catNames.length > 0 && ` · ${item.catNames.join(', ')}`}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedWeightEntries.length > 0 && (
          <Section title='Weight' section='weight' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedWeightEntries.map((item, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <IncludeToggle
                    included={isIncluded('includeWeightEntries', index)}
                    onToggle={() => toggleArrayInclude('includeWeightEntries', index)}
                  />
                  <EditPencilButton editing={isEditing('weight', index)} onClick={() => toggleEditing('weight', index)} />
                </div>
                {isEditing('weight', index) ? (
                  <div className='space-y-2'>
                    <div className='flex flex-col gap-2 sm:flex-row'>
                      <Input
                        type='number'
                        value={item.weight}
                        aria-label='Weight'
                        onChange={(event) => updateWeightAt(index, { weight: Number(event.target.value) })}
                      />
                      <Input
                        type='date'
                        value={toLocalDateInputValue(item.measuredAt)}
                        onChange={(event) => {
                          const measuredAt = withUpdatedDate(item.measuredAt, event.target.value);
                          if (measuredAt !== undefined) {
                            updateWeightAt(index, { measuredAt });
                          }
                        }}
                      />
                      <Input
                        type='time'
                        value={toLocalTimeInputValue(item.measuredAt)}
                        onChange={(event) => {
                          const measuredAt = withUpdatedTime(item.measuredAt, event.target.value);
                          if (measuredAt !== undefined) {
                            updateWeightAt(index, { measuredAt });
                          }
                        }}
                      />
                    </div>
                    <SingleCatSelect
                      catName={item.catName}
                      cats={cats}
                      onChange={(catName) => updateWeightAt(index, { catName })}
                    />
                  </div>
                ) : (
                  <span>
                    {item.weight} {item.unit}
                    {item.catName && ` · ${item.catName}`}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedSymptoms.length > 0 && (
          <Section title='Symptoms' section='symptoms' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedSymptoms.map((item, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <IncludeToggle included={isIncluded('includeSymptoms', index)} onToggle={() => toggleArrayInclude('includeSymptoms', index)} />
                  <EditPencilButton editing={isEditing('symptom', index)} onClick={() => toggleEditing('symptom', index)} />
                </div>
                {isEditing('symptom', index) ? (
                  <Input
                    value={item.description}
                    aria-label='Symptom description'
                    onChange={(event) => updateSymptomAt(index, { description: event.target.value })}
                  />
                ) : (
                  <span>
                    {item.description}
                    {item.catName && ` · ${item.catName}`}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedConditions.length > 0 && (
          <Section title='Conditions' section='conditions' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedConditions.map((item, index) => (
              <div key={index} className='space-y-2 rounded-md border border-border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <IncludeToggle included={isIncluded('includeConditions', index)} onToggle={() => toggleArrayInclude('includeConditions', index)} />
                  <EditPencilButton editing={isEditing('condition', index)} onClick={() => toggleEditing('condition', index)} />
                </div>
                {isEditing('condition', index) ? (
                  <Input
                    value={item.name}
                    aria-label='Condition name'
                    onChange={(event) => updateConditionAt(index, { name: event.target.value })}
                  />
                ) : (
                  <span>
                    {item.name}
                    {item.catName && ` · ${item.catName}`}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {draft.proposedExpenses.length > 0 && (
          <Section title='Expenses' section='expense' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedExpenses.map((expense, expenseIndex) => {
              const amount = expense.items.reduce((sum, item) => sum + item.amount, 0);
              return (
                <div key={expenseIndex} className='space-y-2 rounded-md border border-border p-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <IncludeToggle
                      included={isIncluded('includeExpenses', expenseIndex)}
                      onToggle={() => toggleArrayInclude('includeExpenses', expenseIndex)}
                    />
                    <EditPencilButton
                      editing={isEditing('expense', expenseIndex)}
                      onClick={() => toggleEditing('expense', expenseIndex)}
                    />
                  </div>
                  <p className='text-sm'>
                    ${amount.toFixed(2)} · {formatDateTime(expense.incurredAt)}
                    {expense.catNames.length > 0 && ` · ${expense.catNames.join(', ')}`}
                  </p>
                  {isEditing('expense', expenseIndex) ? (
                    <div className='space-y-2'>
                      {expense.items.map((item, itemIndex) => (
                        <div key={itemIndex} className='flex flex-col gap-2 sm:flex-row'>
                          <Select
                            options={DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
                              text: getExpenseCategoryLabel(category),
                              value: category,
                            }))}
                            value={item.category}
                            onChange={(value) => updateExpenseItemAt(expenseIndex, itemIndex, { category: value })}
                          />
                          <Input
                            value={item.label ?? ''}
                            placeholder='Line item label'
                            onChange={(event) =>
                              updateExpenseItemAt(expenseIndex, itemIndex, { label: event.target.value })
                            }
                          />
                          <Input
                            type='number'
                            value={item.amount}
                            aria-label='Amount'
                            onChange={(event) =>
                              updateExpenseItemAt(expenseIndex, itemIndex, { amount: Number(event.target.value) })
                            }
                          />
                        </div>
                      ))}
                      <CatNamesEditor
                        catNames={expense.catNames}
                        cats={cats}
                        onChange={(catNames) => updateExpenseAt(expenseIndex, { catNames })}
                      />
                    </div>
                  ) : (
                    expense.items.length > 1 && (
                      <ul className='space-y-1 text-sm text-muted-foreground'>
                        {expense.items.map((item, itemIndex) => (
                          <li key={itemIndex}>
                            {item.label ?? getExpenseCategoryLabel(item.category)} · ${item.amount.toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              );
            })}
          </Section>
        )}

        {error && <p className='text-sm text-red-500'>{error}</p>}
      </div>

      <div className='mt-3 space-y-2 border-t border-border pt-3'>
        <IncludeToggle
          label='Save as a permanent health record'
          included={Boolean(file) && selections.saveAsRecord !== false}
          onToggle={() => setSelections((current) => ({ ...current, saveAsRecord: current.saveAsRecord === false }))}
          disabled={!file}
        />
        <p className='text-muted-foreground text-sm'>
          {file
            ? 'Keep the uploaded file attached to the confirmed visit.'
            : "The original file isn't available to save — re-upload the document to keep it as a record."}
        </p>
        {file && selections.saveAsRecord !== false && (
          <Select
            options={RECORD_TYPE_OPTIONS}
            value={recordType}
            onChange={(value) => setRecordType(value as Exclude<HealthRecordType, 'custom'>)}
          />
        )}
      </div>

      <p className='mt-3 text-sm text-muted-foreground'>
        {includedCount} of {totalCount} proposals will be saved.
      </p>
      <div className='mt-2 flex flex-wrap justify-between gap-2'>
        <Button type='button' variant='destructive' disabled={isSubmitting} onClick={() => void handleDiscard()}>
          Discard
        </Button>
        <div className='flex gap-2'>
          <Button type='button' variant='secondary' disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type='button' loading={isSubmitting} onClick={() => void handleConfirm()}>
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default IngestionDraftReviewModal;
