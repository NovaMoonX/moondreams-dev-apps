import { useState, type ReactNode } from 'react';

import {
  Badge,
  Button,
  Disclosure,
  DropdownMenu,
  DropdownMenuFactories,
  Input,
  Modal,
  Select,
  Tooltip,
  Toggle,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
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
  Trash2,
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
import { formatDate, formatDateTime } from '@/utils/formatUtils';

import {
  confirmIngestionDraft,
  discardIngestionDraft,
  updateIngestionDraft,
  type IngestionDraftSelections,
} from '../store/actions/ingestionDraftsActions';
import {
  selectCatsByHousehold,
  selectClinicsByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import { DEFAULT_EXPENSE_CATEGORIES, getExpenseCategoryLabel } from '../utils/budgetCalculators';
import type { Cat, CatSex, HealthRecordType, IngestionDraft, VisitReason } from '../types';
import RecordTypeField, { NEW_TYPE_VALUE, type RecordTypeChoice } from './RecordTypeField';

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

function getOptionLabel(options: Array<{ text: string; value: string }>, value: string | null | undefined) {
  function matchesValue(option: { text: string; value: string }) {
    return option.value === value;
  }
  return options.find(matchesValue)?.text ?? value ?? '';
}

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

type ExpandedSection = ReviewSection | 'all' | null;

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
  section:
    | 'cat'
    | 'clinic'
    | 'visit'
    | 'vaccination'
    | 'preventive'
    | 'weight'
    | 'symptom'
    | 'condition'
    | 'expense';
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

function EditPencilButton({
  editing,
  onClick,
  onDelete,
}: {
  editing: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className='flex items-center gap-1'>
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
      {onDelete && (
        <Button
          type='button'
          variant='secondary'
          size='icon'
          aria-label='Remove item'
          onClick={onDelete}
          className='bg-transparent text-destructive'
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}

function ReviewStatusBadge({
  label,
  message,
  variant,
  badgePlacement,
  className,
}: {
  label: string;
  message: string;
  variant: 'success' | 'warning';
  /** Where the badge sits within the modal, so the tooltip can open toward the free space. */
  badgePlacement: 'left' | 'center' | 'right';
  className?: string;
}) {
  const tooltipPlacement = badgePlacement === 'left' ? 'right' : badgePlacement === 'right' ? 'left' : 'top';
  return (
    <Tooltip
      message={<div className={join('text-xs', badgePlacement === 'center' && 'max-w-48')}>{message}</div>}
      placement={tooltipPlacement}
    >
      <Badge variant={variant} size='xs' className={join('cursor-help', className)}>
        {label}
      </Badge>
    </Tooltip>
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

  function isCatNotAttached(cat: Cat) {
    function matchesCatName(name: string) {
      return name.toLowerCase() === cat.name.toLowerCase();
    }
    return !catNames.some(matchesCatName);
  }
  const availableToAdd = cats.filter(isCatNotAttached);

  function renderCatNameChip(name: string, index: number) {
    function handleRemoveCatName() {
      function isOtherIndex(_: string, i: number) {
        return i !== index;
      }
      onChange(catNames.filter(isOtherIndex));
    }

    return (
      <span
        key={`${name}-${index}`}
        className='inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs'
      >
        {name}
        <Button
          variant='base'
          size='icon'
          type='button'
          aria-label={`Remove ${name}`}
          onClick={handleRemoveCatName}
          className='h-4 w-4 p-0'
        >
          <X className='h-3 w-3' />
        </Button>
      </span>
    );
  }

  function toCatOption(cat: Cat) {
    return { text: cat.name, value: cat.name };
  }

  function handleSelectCatToAdd(value: string) {
    if (value) {
      onChange([...catNames, value]);
    }
    setAdding(false);
  }

  function handleStartAdding() {
    setAdding(true);
  }

  return (
    <div className='space-y-1'>
      {catNames.length > 0 && (
        <div className='flex flex-wrap gap-1'>{catNames.map(renderCatNameChip)}</div>
      )}
      {adding ? (
        <Select
          options={availableToAdd.map(toCatOption)}
          value=''
          placeholder='Select a cat to add'
          onChange={handleSelectCatToAdd}
        />
      ) : (
        availableToAdd.length > 0 && (
          <Button type='button' variant='link' size='sm' className={mutedLinkClassName} onClick={handleStartAdding}>
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
  function toCatOption(cat: Cat) {
    return { text: cat.name, value: cat.name };
  }
  function matchesCatName(cat: Cat) {
    return cat.name.toLowerCase() === catName?.toLowerCase();
  }
  function handleChange(value: string) {
    onChange(value || null);
  }

  const options = [
    ...cats.map(toCatOption),
    ...(catName && !cats.some(matchesCatName) ? [{ text: catName, value: catName }] : []),
  ];

  return <Select options={options} value={catName ?? ''} placeholder='Select a cat' onChange={handleChange} />;
}

function ReviewProgressPills({
  sections,
  reviewed,
  expanded,
  onSelect,
}: {
  sections: ReviewSection[];
  reviewed: Set<ReviewSection>;
  expanded: ExpandedSection;
  onSelect: (section: ReviewSection | 'all') => void;
}) {
  function handleSelectAll() {
    onSelect('all');
  }

  function renderSectionPill(section: ReviewSection) {
    const isActive = expanded === section;
    const isReviewed = reviewed.has(section);
    const Icon = SECTION_ICONS[section];

    function handleSelectSection() {
      onSelect(section);
    }

    return (
      <Button
        key={section}
        type='button'
        variant='base'
        size='sm'
        onClick={handleSelectSection}
        className={join(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
          isActive
            ? 'border-primary text-primary'
            : isReviewed
              ? 'border-border bg-muted text-foreground'
              : 'border-border text-muted-foreground',
        )}
      >
        <Icon className='h-3 w-3' /> {SECTION_LABELS[section]}
      </Button>
    );
  }

  return (
    <div className='flex flex-wrap gap-1.5'>
      <Button
        type='button'
        variant='base'
        size='sm'
        onClick={handleSelectAll}
        className={join(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
          expanded === 'all' ? 'border-primary text-primary' : 'border-border text-muted-foreground',
        )}
      >
        All
      </Button>
      {sections.map(renderSectionPill)}
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
  expanded: ExpandedSection;
  onToggle: (section: ReviewSection) => void;
  children: ReactNode;
}) {
  const Icon = SECTION_ICONS[section];

  function handleToggle() {
    onToggle(section);
  }

  return (
    <div className='rounded-lg border-2 border-border'>
      <Disclosure
        label={
          <span className='flex items-center gap-2 font-medium'>
            <Icon className='h-4 w-4' /> {title}
          </span>
        }
        isOpen={expanded === section || expanded === 'all'}
        onToggle={handleToggle}
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
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);

  function alwaysNull() {
    return null;
  }
  function alwaysFalse() {
    return false;
  }
  function invert(isDuplicate: boolean) {
    return !isDuplicate;
  }

  const matchedCatIds = draft.matchedCatIds ?? draft.proposedCats.map(alwaysNull);
  const matchedClinicIds = draft.matchedClinicIds ?? draft.proposedClinics.map(alwaysNull);
  const matchedVisitIds = draft.matchedVisitIds ?? draft.proposedVisits.map(alwaysNull);
  const matchedVaccinationIds =
    draft.matchedVaccinationIds ?? draft.proposedVaccinations.map(alwaysNull);
  const matchedPreventiveIds =
    draft.matchedPreventiveIds ?? draft.proposedPreventives.map(alwaysNull);
  const likelyDuplicateWeightEntries =
    draft.likelyDuplicateWeightEntries ?? draft.proposedWeightEntries.map(alwaysFalse);
  const likelyDuplicateSymptoms =
    draft.likelyDuplicateSymptoms ?? draft.proposedSymptoms.map(alwaysFalse);
  const likelyDuplicateVaccinations =
    draft.likelyDuplicateVaccinations ?? draft.proposedVaccinations.map(alwaysFalse);
  const likelyDuplicatePreventives =
    draft.likelyDuplicatePreventives ?? draft.proposedPreventives.map(alwaysFalse);
  const likelyDuplicateExpenses =
    draft.likelyDuplicateExpenses ?? draft.proposedExpenses.map(alwaysFalse);
  const matchedLibraryConditionIds =
    draft.matchedLibraryConditionIds ?? draft.proposedConditions.map(alwaysNull);
  const matchedCatConditionIds =
    draft.matchedCatConditionIds ?? draft.proposedConditions.map(alwaysNull);

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

  const [expanded, setExpanded] = useState<ExpandedSection>(initialSection);
  const [reviewed, setReviewed] = useState<Set<ReviewSection>>(
    new Set(initialSection ? [initialSection] : []),
  );
  const [editing, setEditing] = useState<EditingKey | null>(null);
  const [editingVisitNotes, setEditingVisitNotes] = useState<Set<number>>(new Set());
  const [pickingExisting, setPickingExisting] = useState<Set<string>>(new Set());
  const [addedItemKeys, setAddedItemKeys] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<IngestionDraftSelections>({
    saveAsRecord: draft.suggestKeepAsRecord,
    catIds: matchedCatIds,
    clinicIds: matchedClinicIds,
    visitIds: matchedVisitIds,
    vaccinationIds: matchedVaccinationIds,
    preventiveIds: matchedPreventiveIds,
    includeVaccinations: likelyDuplicateVaccinations.map(invert),
    includePreventives: likelyDuplicatePreventives.map(invert),
    includeExpenses: likelyDuplicateExpenses.map(invert),
    includeWeightEntries: likelyDuplicateWeightEntries.map(invert),
    includeSymptoms: likelyDuplicateSymptoms.map(invert),
    conditionIds: matchedCatConditionIds,
    conditionLibraryIds: matchedLibraryConditionIds,
  });
  const [recordTypeChoice, setRecordTypeChoice] = useState<RecordTypeChoice>({
    value: draft.proposedRecordType ?? 'vet_paperwork',
    customRecordTypeId: null,
    customLabel: '',
  });
  const [recordLabel, setRecordLabel] = useState('');
  const [recordLabelOpen, setRecordLabelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSection(section: ReviewSection) {
    function collapseIfSame(current: ExpandedSection) {
      return current === section ? null : section;
    }
    function addSectionToReviewed(current: Set<ReviewSection>) {
      return new Set(current).add(section);
    }
    setExpanded(collapseIfSame);
    setReviewed(addSectionToReviewed);
  }
  function expandAllSections() {
    setExpanded('all');
    setReviewed(new Set(sectionsWithContent));
  }

  function isEditing(section: EditingKey['section'], index: number) {
    return editing?.section === section && editing.index === index;
  }
  function toggleEditing(section: EditingKey['section'], index: number) {
    function resolveEditingState(current: EditingKey | null) {
      return current && current.section === section && current.index === index ? null : { section, index };
    }
    setEditing(resolveEditingState);
  }
  function toggleTargetEditing(section: 'cat' | 'clinic', index: number) {
    const enteringEditing = !isEditing(section, index);
    toggleEditing(section, index);
    if (!enteringEditing) {
      return;
    }
    function clearTargetSelection(current: IngestionDraftSelections) {
      const key = section === 'cat' ? 'catIds' : 'clinicIds';
      const values = [...(current[key] ?? [])];
      values[index] = null;
      return { ...current, [key]: values };
    }
    setSelections(clearTargetSelection);
  }

  function isEditingVisitNotes(index: number) {
    return editingVisitNotes.has(index);
  }
  function startEditingVisitNotes(index: number) {
    function addIndexToEditingVisitNotes(current: Set<number>) {
      return new Set(current).add(index);
    }
    setEditingVisitNotes(addIndexToEditingVisitNotes);
  }

  function isPickingExisting(section: 'cat' | 'clinic', index: number) {
    return pickingExisting.has(`${section}-${index}`);
  }
  function startPickingExisting(section: 'cat' | 'clinic', index: number) {
    function addPickingKey(current: Set<string>) {
      return new Set(current).add(`${section}-${index}`);
    }
    setPickingExisting(addPickingKey);
  }
  function stopPickingExisting(section: 'cat' | 'clinic', index: number) {
    function removePickingKey(current: Set<string>) {
      const next = new Set(current);
      next.delete(`${section}-${index}`);
      return next;
    }
    setPickingExisting(removePickingKey);
    function clearTargetSelection(current: IngestionDraftSelections) {
      const key = section === 'cat' ? 'catIds' : 'clinicIds';
      const values = [...(current[key] ?? [])];
      values[index] = null;
      return { ...current, [key]: values };
    }
    setSelections(clearTargetSelection);
  }

  function toggleArrayInclude(key: ArrayIncludeKey, index: number) {
    function flipIncludeAt(current: IngestionDraftSelections) {
      const values = [...(current[key] ?? [])];
      values[index] = values[index] !== false ? false : true;
      return { ...current, [key]: values };
    }
    setSelections(flipIncludeAt);
  }
  function isIncluded(key: ArrayIncludeKey, index: number) {
    return selections[key]?.[index] !== false;
  }
  function getItemKey(section: ReviewSection, index: number) {
    return `${section}-${index}`;
  }
  function isAddedItem(section: ReviewSection, index: number) {
    return addedItemKeys.has(getItemKey(section, index));
  }

  function updateDraft(changes: Parameters<typeof updateIngestionDraft>[0]['changes']) {
    void dispatch(updateIngestionDraft({ householdId, draftId: draft.id, changes }));
  }

  function updateCatAt(index: number, patch: Partial<IngestionDraft['proposedCats'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedCats'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    updateDraft({ proposedCats: draft.proposedCats.map(applyPatchAtIndex) });
  }
  function updateClinicAt(index: number, patch: Partial<IngestionDraft['proposedClinics'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedClinics'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    updateDraft({ proposedClinics: draft.proposedClinics.map(applyPatchAtIndex) });
  }
  function updateVisitAt(index: number, patch: Partial<IngestionDraft['proposedVisits'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedVisits'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    function clearVisitSelection(current: IngestionDraftSelections) {
      const values = [...(current.visitIds ?? [])];
      values[index] = null;
      return { ...current, visitIds: values };
    }
    updateDraft({ proposedVisits: draft.proposedVisits.map(applyPatchAtIndex) });
    if ('scheduledAt' in patch || 'clinicName' in patch || 'catNames' in patch) {
      setSelections(clearVisitSelection);
    }
  }
  function updateVaccinationAt(
    index: number,
    patch: Partial<IngestionDraft['proposedVaccinations'][number]>,
  ) {
    function applyPatchAtIndex(item: IngestionDraft['proposedVaccinations'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    function clearVaccinationSelection(current: IngestionDraftSelections) {
      const values = [...(current.vaccinationIds ?? [])];
      values[index] = null;
      return { ...current, vaccinationIds: values };
    }
    updateDraft({ proposedVaccinations: draft.proposedVaccinations.map(applyPatchAtIndex) });
    if ('name' in patch || 'catName' in patch) {
      setSelections(clearVaccinationSelection);
    }
  }
  function updatePreventiveAt(
    index: number,
    patch: Partial<IngestionDraft['proposedPreventives'][number]>,
  ) {
    function applyPatchAtIndex(item: IngestionDraft['proposedPreventives'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    function clearPreventiveSelection(current: IngestionDraftSelections) {
      const values = [...(current.preventiveIds ?? [])];
      values[index] = null;
      return { ...current, preventiveIds: values };
    }
    updateDraft({ proposedPreventives: draft.proposedPreventives.map(applyPatchAtIndex) });
    if ('name' in patch || 'type' in patch || 'catNames' in patch) {
      setSelections(clearPreventiveSelection);
    }
  }
  function updateWeightAt(index: number, patch: Partial<IngestionDraft['proposedWeightEntries'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedWeightEntries'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    updateDraft({ proposedWeightEntries: draft.proposedWeightEntries.map(applyPatchAtIndex) });
  }
  function updateSymptomAt(index: number, patch: Partial<IngestionDraft['proposedSymptoms'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedSymptoms'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    updateDraft({ proposedSymptoms: draft.proposedSymptoms.map(applyPatchAtIndex) });
  }
  function updateConditionAt(index: number, patch: Partial<IngestionDraft['proposedConditions'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedConditions'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    function clearConditionSelection(current: IngestionDraftSelections) {
      const values = [...(current.conditionIds ?? [])];
      const libraryValues = [...(current.conditionLibraryIds ?? [])];
      values[index] = null;
      libraryValues[index] = null;
      return { ...current, conditionIds: values, conditionLibraryIds: libraryValues };
    }
    updateDraft({ proposedConditions: draft.proposedConditions.map(applyPatchAtIndex) });
    if ('name' in patch || 'catName' in patch) {
      setSelections(clearConditionSelection);
    }
  }
  function updateExpenseAt(index: number, patch: Partial<IngestionDraft['proposedExpenses'][number]>) {
    function applyPatchAtIndex(item: IngestionDraft['proposedExpenses'][number], i: number) {
      return i === index ? { ...item, ...patch } : item;
    }
    updateDraft({ proposedExpenses: draft.proposedExpenses.map(applyPatchAtIndex) });
  }
  function updateExpenseItemAt(
    expenseIndex: number,
    itemIndex: number,
    patch: Partial<IngestionDraft['proposedExpenses'][number]['items'][number]>,
  ) {
    function applyPatchAtItemIndex(
      item: IngestionDraft['proposedExpenses'][number]['items'][number],
      i: number,
    ) {
      return i === itemIndex ? { ...item, ...patch } : item;
    }
    const expense = draft.proposedExpenses[expenseIndex];
    updateExpenseAt(expenseIndex, { items: expense.items.map(applyPatchAtItemIndex) });
  }

  function removeItem(section: ReviewSection, index: number) {
    function isOtherIndex(_: unknown, itemIndex: number) {
      return itemIndex !== index;
    }
    function removeAt<T>(items: T[]) {
      return items.filter(isOtherIndex);
    }
    function removeSelectionKey(next: IngestionDraftSelections, key: keyof IngestionDraftSelections) {
      const values = next[key];
      if (Array.isArray(values)) {
        next[key] = values.filter(isOtherIndex) as never;
      }
    }
    function pruneSelections(current: IngestionDraftSelections) {
      const next = { ...current };
      if (section === 'cat') removeSelectionKey(next, 'catIds');
      if (section === 'clinic') removeSelectionKey(next, 'clinicIds');
      if (section === 'visit') removeSelectionKey(next, 'visitIds');
      if (section === 'vaccinations') removeSelectionKey(next, 'vaccinationIds');
      if (section === 'preventives') removeSelectionKey(next, 'preventiveIds');
      if (section === 'conditions') {
        removeSelectionKey(next, 'conditionIds');
        removeSelectionKey(next, 'conditionLibraryIds');
      }
      return next;
    }
    function relocateAddedItemKey(next: Set<string>, key: string) {
      const [keySection, keyIndex] = key.split('-');
      const parsedIndex = Number(keyIndex);
      if (keySection !== section || parsedIndex < index) {
        next.add(key);
      } else if (parsedIndex > index) {
        next.add(getItemKey(section, parsedIndex - 1));
      }
    }
    function pruneAddedItemKeys(current: Set<string>) {
      const next = new Set<string>();
      function relocateEachKey(key: string) {
        relocateAddedItemKey(next, key);
      }
      current.forEach(relocateEachKey);
      return next;
    }

    switch (section) {
      case 'cat':
        updateDraft({ proposedCats: removeAt(draft.proposedCats) });
        break;
      case 'clinic':
        updateDraft({ proposedClinics: removeAt(draft.proposedClinics) });
        break;
      case 'visit':
        updateDraft({ proposedVisits: removeAt(draft.proposedVisits) });
        break;
      case 'vaccinations':
        updateDraft({ proposedVaccinations: removeAt(draft.proposedVaccinations) });
        break;
      case 'preventives':
        updateDraft({ proposedPreventives: removeAt(draft.proposedPreventives) });
        break;
      case 'weight':
        updateDraft({ proposedWeightEntries: removeAt(draft.proposedWeightEntries) });
        break;
      case 'symptoms':
        updateDraft({ proposedSymptoms: removeAt(draft.proposedSymptoms) });
        break;
      case 'conditions':
        updateDraft({ proposedConditions: removeAt(draft.proposedConditions) });
        break;
      case 'expense':
        updateDraft({ proposedExpenses: removeAt(draft.proposedExpenses) });
        break;
    }

    setSelections(pruneSelections);
    setAddedItemKeys(pruneAddedItemKeys);
    setEditing(null);
  }

  function addBlankItem(section: ReviewSection) {
    const nextIndex =
      section === 'cat'
        ? draft.proposedCats.length
        : section === 'clinic'
          ? draft.proposedClinics.length
          : section === 'visit'
            ? draft.proposedVisits.length
            : section === 'vaccinations'
              ? draft.proposedVaccinations.length
              : section === 'preventives'
                ? draft.proposedPreventives.length
                : section === 'weight'
                  ? draft.proposedWeightEntries.length
                  : section === 'symptoms'
                    ? draft.proposedSymptoms.length
                    : section === 'conditions'
                      ? draft.proposedConditions.length
                      : draft.proposedExpenses.length;

    switch (section) {
      case 'cat':
        updateDraft({ proposedCats: [...draft.proposedCats, blankCat()] });
        setEditing({ section: 'cat', index: nextIndex });
        break;
      case 'clinic':
        updateDraft({ proposedClinics: [...draft.proposedClinics, blankClinic()] });
        setEditing({ section: 'clinic', index: nextIndex });
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
    function addNewItemKey(current: Set<string>) {
      return new Set(current).add(getItemKey(section, nextIndex));
    }
    function addSectionToReviewed(current: Set<ReviewSection>) {
      return new Set(current).add(section);
    }
    setAddedItemKeys(addNewItemKey);
    setExpanded(section);
    setReviewed(addSectionToReviewed);
  }

  function countNewItems(length: number, key: ArrayIncludeKey, selectedIds?: (string | null)[]) {
    function toIndex(_: unknown, index: number) {
      return index;
    }
    function isNewAndIncluded(index: number) {
      return isIncluded(key, index) && !selectedIds?.[index];
    }
    return Array.from({ length }, toIndex).filter(isNewAndIncluded).length;
  }
  function isWeightEntryIncluded(_: unknown, index: number) {
    return isIncluded('includeWeightEntries', index);
  }
  function isSymptomIncluded(_: unknown, index: number) {
    return isIncluded('includeSymptoms', index);
  }
  function isExpenseIncluded(_: unknown, index: number) {
    return isIncluded('includeExpenses', index);
  }
  const newCount =
    countNewItems(draft.proposedCats.length, 'includeCats', selections.catIds) +
    countNewItems(draft.proposedClinics.length, 'includeClinics', selections.clinicIds) +
    countNewItems(draft.proposedVisits.length, 'includeVisits', selections.visitIds) +
    countNewItems(
      draft.proposedVaccinations.length,
      'includeVaccinations',
      selections.vaccinationIds,
    ) +
    countNewItems(draft.proposedPreventives.length, 'includePreventives', selections.preventiveIds) +
    draft.proposedWeightEntries.filter(isWeightEntryIncluded).length +
    draft.proposedSymptoms.filter(isSymptomIncluded).length +
    countNewItems(draft.proposedConditions.length, 'includeConditions', selections.conditionIds) +
    draft.proposedExpenses.filter(isExpenseIncluded).length;
  const duplicateCount =
    likelyDuplicateVaccinations.filter(Boolean).length +
    likelyDuplicatePreventives.filter(Boolean).length +
    likelyDuplicateWeightEntries.filter(Boolean).length +
    likelyDuplicateSymptoms.filter(Boolean).length +
    likelyDuplicateExpenses.filter(Boolean).length;

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);

    const selectedRecordType: Exclude<HealthRecordType, 'custom'> =
      recordTypeChoice.value === 'custom' || recordTypeChoice.value === NEW_TYPE_VALUE
        ? draft.proposedRecordType ?? 'vet_paperwork'
        : recordTypeChoice.value;

    try {
      await dispatch(
        updateIngestionDraft({
          householdId,
          draftId: draft.id,
          changes: { proposedRecordType: selectedRecordType },
        }),
      ).unwrap();
      await dispatch(
        confirmIngestionDraft({
          householdId,
          draftId: draft.id,
          uid,
          selections,
          file,
          recordTypeChoice,
          recordLabel,
        }),
      ).unwrap();
      onClose();
    } catch (submissionError) {
      setError(typeof submissionError === 'string' ? submissionError : 'Unable to confirm this document.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDiscard() {
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
  }

  function handleDiscardClick() {
    void handleDiscard();
  }
  function handleConfirmClick() {
    void handleConfirm();
  }

  const { option } = DropdownMenuFactories;
  function toAddItemMenuOption(section: ReviewSection) {
    return option({ label: SECTION_SINGULAR_LABELS[section], value: section });
  }
  const addItemMenuItems = (Object.keys(SECTION_LABELS) as ReviewSection[]).map(toAddItemMenuOption);

  function handleSelectProgressPill(section: ReviewSection | 'all') {
    if (section === 'all') {
      expandAllSections();
    } else {
      toggleSection(section);
    }
  }
  function handleSelectAddItemMenu(value: string) {
    addBlankItem(value as ReviewSection);
  }

  function renderCatRow(cat: IngestionDraft['proposedCats'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeCats', index);
    }
    function handleToggleEditingTarget() {
      toggleTargetEditing('cat', index);
    }
    function handleDelete() {
      removeItem('cat', index);
    }
    function toExistingCatOption(existingCat: Cat) {
      return { text: existingCat.name, value: existingCat.id };
    }
    function handleSelectExistingCat(value: string) {
      function applyCatSelection(current: IngestionDraftSelections) {
        const values = [...(current.catIds ?? [])];
        values[index] = value || null;
        return { ...current, catIds: values };
      }
      setSelections(applyCatSelection);
    }
    function handleStopPickingExisting() {
      stopPickingExisting('cat', index);
    }
    function handleNameChange(event: { target: { value: string } }) {
      updateCatAt(index, { name: event.target.value });
    }
    function handleBreedChange(event: { target: { value: string } }) {
      updateCatAt(index, { breed: event.target.value || null });
    }
    function handleSexChange(value: string) {
      updateCatAt(index, { sex: value as CatSex });
    }
    function handleStartPickingExisting() {
      startPickingExisting('cat', index);
    }
    function matchesSelectedCatId(candidate: Cat) {
      return candidate.id === selections.catIds?.[index];
    }
    function renderReadOnlySummary() {
      const existingCat = cats.find(matchesSelectedCatId);
      const summary = existingCat
        ? [existingCat.name, existingCat.breed, getOptionLabel(SEX_OPTIONS, existingCat.sex)]
            .filter(Boolean)
            .join(' · ')
        : [cat.name || 'New cat', cat.breed, cat.sex ? getOptionLabel(SEX_OPTIONS, cat.sex) : null]
            .filter(Boolean)
            .join(' · ');
      return <p className='text-sm'>{summary}</p>;
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includeCats', index)} onToggle={handleToggleInclude} />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={selections.catIds?.[index] ? 'Matched' : 'New'}
              message={
                selections.catIds?.[index]
                  ? 'This proposal is linked to the existing cat. Edit it to create a new cat instead.'
                  : 'This proposal will create a new cat.'
              }
              variant='success'
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('cat', index)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('cat', index) ? handleDelete : undefined}
            />
          </div>
        </div>
        {isEditing('cat', index) && isPickingExisting('cat', index) ? (
          <>
            <Select
              options={cats.map(toExistingCatOption)}
              value={selections.catIds?.[index] ?? ''}
              placeholder='Select an existing cat'
              onChange={handleSelectExistingCat}
            />
            <Button
              type='button'
              variant='link'
              size='sm'
              className={mutedLinkClassName}
              onClick={handleStopPickingExisting}
            >
              Enter a new name instead
            </Button>
          </>
        ) : isEditing('cat', index) ? (
          <>
            <Input
              value={cat.name}
              aria-label='Proposed cat name'
              placeholder='Cat name'
              onChange={handleNameChange}
            />
            <div className='grid grid-cols-2 gap-2'>
              <Input value={cat.breed ?? ''} placeholder='Breed' onChange={handleBreedChange} />
              <Select options={SEX_OPTIONS} value={cat.sex ?? 'unknown'} onChange={handleSexChange} />
            </div>
            {cats.length > 0 && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={handleStartPickingExisting}
              >
                Choose from existing instead
              </Button>
            )}
          </>
        ) : (
          renderReadOnlySummary()
        )}
      </div>
    );
  }

  function renderClinicRow(clinic: IngestionDraft['proposedClinics'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeClinics', index);
    }
    function handleToggleEditingTarget() {
      toggleTargetEditing('clinic', index);
    }
    function handleDelete() {
      removeItem('clinic', index);
    }
    function toExistingClinicOption(existingClinic: { name: string; id: string }) {
      return { text: existingClinic.name, value: existingClinic.id };
    }
    function handleSelectExistingClinic(value: string) {
      function applyClinicSelection(current: IngestionDraftSelections) {
        const values = [...(current.clinicIds ?? [])];
        values[index] = value || null;
        return { ...current, clinicIds: values };
      }
      setSelections(applyClinicSelection);
    }
    function handleStopPickingExisting() {
      stopPickingExisting('clinic', index);
    }
    function handleNameChange(event: { target: { value: string } }) {
      updateClinicAt(index, { name: event.target.value });
    }
    function handlePhoneChange(event: { target: { value: string } }) {
      updateClinicAt(index, { phone: event.target.value || null });
    }
    function handleEmailChange(event: { target: { value: string } }) {
      updateClinicAt(index, { email: event.target.value || null });
    }
    function handleAddressChange(event: { target: { value: string } }) {
      updateClinicAt(index, { address: event.target.value || null });
    }
    function handleStartPickingExisting() {
      startPickingExisting('clinic', index);
    }
    function matchesSelectedClinicId(candidate: { id: string }) {
      return candidate.id === selections.clinicIds?.[index];
    }
    function renderReadOnlySummary() {
      const existingClinic = clinics.find(matchesSelectedClinicId);
      const summary = existingClinic
        ? [existingClinic.name, existingClinic.phone, existingClinic.address].filter(Boolean).join(' · ')
        : [clinic.name || 'New clinic', clinic.phone, clinic.address].filter(Boolean).join(' · ');
      return <p className='text-sm'>{summary}</p>;
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includeClinics', index)} onToggle={handleToggleInclude} />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={selections.clinicIds?.[index] ? 'Matched' : 'New'}
              message={
                selections.clinicIds?.[index]
                  ? 'This proposal is linked to the existing clinic. Edit it to create a new clinic instead.'
                  : 'This proposal will create a new clinic.'
              }
              variant='success'
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('clinic', index)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('clinic', index) ? handleDelete : undefined}
            />
          </div>
        </div>
        {isEditing('clinic', index) && isPickingExisting('clinic', index) ? (
          <>
            <Select
              options={clinics.map(toExistingClinicOption)}
              value={selections.clinicIds?.[index] ?? ''}
              placeholder='Select an existing clinic'
              onChange={handleSelectExistingClinic}
            />
            <Button
              type='button'
              variant='link'
              size='sm'
              className={mutedLinkClassName}
              onClick={handleStopPickingExisting}
            >
              Enter a new name instead
            </Button>
          </>
        ) : isEditing('clinic', index) ? (
          <>
            <Input
              value={clinic.name}
              aria-label='Proposed clinic name'
              placeholder='Clinic name'
              onChange={handleNameChange}
            />
            <div className='grid grid-cols-2 gap-2'>
              <Input value={clinic.phone ?? ''} placeholder='Phone' onChange={handlePhoneChange} />
              <Input value={clinic.email ?? ''} placeholder='Email' onChange={handleEmailChange} />
            </div>
            <Input value={clinic.address ?? ''} placeholder='Address' onChange={handleAddressChange} />
            {clinics.length > 0 && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={handleStartPickingExisting}
              >
                Choose from existing instead
              </Button>
            )}
          </>
        ) : (
          renderReadOnlySummary()
        )}
      </div>
    );
  }

  function renderVisitRow(visit: IngestionDraft['proposedVisits'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeVisits', index);
    }
    function handleToggleEditingTarget() {
      toggleEditing('visit', index);
    }
    function handleDelete() {
      removeItem('visit', index);
    }
    function handleDateChange(event: { target: { value: string } }) {
      const scheduledAt = withUpdatedDate(visit.scheduledAt, event.target.value);
      if (scheduledAt !== undefined) {
        updateVisitAt(index, { scheduledAt });
      }
    }
    function handleTimeChange(event: { target: { value: string } }) {
      const scheduledAt = withUpdatedTime(visit.scheduledAt, event.target.value);
      if (scheduledAt !== undefined) {
        updateVisitAt(index, { scheduledAt });
      }
    }
    function handleReasonChange(value: string) {
      updateVisitAt(index, { reason: value as VisitReason });
    }
    function handleCustomReasonChange(event: { target: { value: string } }) {
      updateVisitAt(index, { customReasonLabel: event.target.value || null });
    }
    function handleClinicNameChange(event: { target: { value: string } }) {
      updateVisitAt(index, { clinicName: event.target.value || null });
    }
    function handleCatNamesChange(catNames: string[]) {
      updateVisitAt(index, { catNames });
    }
    function findMatchedVisit(existingVisit: { id: string }) {
      return existingVisit.id === selections.visitIds?.[index];
    }
    function handleUnmatchVisit() {
      function clearVisitSelection(current: IngestionDraftSelections) {
        const values = [...(current.visitIds ?? [])];
        values[index] = null;
        return { ...current, visitIds: values };
      }
      setSelections(clearVisitSelection);
    }
    function handleStartEditingNotes() {
      startEditingVisitNotes(index);
    }
    function handleNotesChange(event: { target: { value: string } }) {
      updateVisitAt(index, { notes: event.target.value });
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includeVisits', index)} onToggle={handleToggleInclude} />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={selections.visitIds?.[index] ? 'Matched' : 'New'}
              message={
                selections.visitIds?.[index]
                  ? 'This proposal will complete the matching scheduled visit.'
                  : 'This proposal will create a new visit.'
              }
              variant='success'
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('visit', index)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('visit', index) ? handleDelete : undefined}
            />
          </div>
        </div>
        {isEditing('visit', index) ? (
          <div className='space-y-2'>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input type='date' value={toLocalDateInputValue(visit.scheduledAt)} onChange={handleDateChange} />
              <Input type='time' value={toLocalTimeInputValue(visit.scheduledAt)} onChange={handleTimeChange} />
              <Select options={REASON_OPTIONS} value={visit.reason} onChange={handleReasonChange} />
            </div>
            {visit.reason === 'custom' && (
              <Input
                value={visit.customReasonLabel ?? ''}
                placeholder='Custom reason'
                onChange={handleCustomReasonChange}
              />
            )}
            <Input value={visit.clinicName ?? ''} placeholder='Clinic name' onChange={handleClinicNameChange} />
            <CatNamesEditor catNames={visit.catNames} cats={cats} onChange={handleCatNamesChange} />
          </div>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {formatDateTime(visit.scheduledAt)} ·{' '}
            {visit.reason === 'custom'
              ? visit.customReasonLabel || getOptionLabel(REASON_OPTIONS, visit.reason)
              : getOptionLabel(REASON_OPTIONS, visit.reason)}
            {visit.catNames.length > 0 && ` · ${visit.catNames.join(', ')}`}
            {visit.clinicName && ` · ${visit.clinicName}`}
          </p>
        )}
        {selections.visitIds?.[index] && (
          <ReviewStatusBadge
            label='Matched visit'
            message={`This will mark the visit on ${formatDateTime(
              visits.find(findMatchedVisit)?.scheduledAt ?? visit.scheduledAt,
            )} completed instead of creating another visit.`}
            variant='success'
            badgePlacement='left'
          />
        )}
        {selections.visitIds?.[index] && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className={mutedLinkClassName}
            onClick={handleUnmatchVisit}
          >
            Create a new visit instead
          </Button>
        )}
        {isEditingVisitNotes(index) ? (
          <Input value={visit.notes ?? ''} placeholder='Visit notes' onChange={handleNotesChange} />
        ) : (
          <div className='space-y-1'>
            {visit.notes && <p className='text-sm'>{visit.notes}</p>}
            <Button
              type='button'
              variant='link'
              size='sm'
              className={mutedLinkClassName}
              onClick={handleStartEditingNotes}
            >
              {visit.notes ? 'Edit notes' : '+ Add notes'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  function renderVaccinationRow(item: IngestionDraft['proposedVaccinations'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeVaccinations', index);
    }
    function handleToggleEditingTarget() {
      toggleEditing('vaccination', index);
    }
    function handleDelete() {
      removeItem('vaccinations', index);
    }
    function handleNameChange(event: { target: { value: string } }) {
      updateVaccinationAt(index, { name: event.target.value });
    }
    function handleDateChange(event: { target: { value: string } }) {
      const administeredAt = withUpdatedDate(item.administeredAt, event.target.value);
      if (administeredAt !== undefined) {
        updateVaccinationAt(index, { administeredAt });
      }
    }
    function handleCatNameChange(catName: string | null) {
      updateVaccinationAt(index, { catName });
    }
    function handleUnmatchVaccination() {
      function clearVaccinationSelection(current: IngestionDraftSelections) {
        const values = [...(current.vaccinationIds ?? [])];
        values[index] = null;
        return { ...current, vaccinationIds: values };
      }
      setSelections(clearVaccinationSelection);
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includeVaccinations', index)} onToggle={handleToggleInclude} />
          <EditPencilButton
            editing={isEditing('vaccination', index)}
            onClick={handleToggleEditingTarget}
            onDelete={isAddedItem('vaccinations', index) ? handleDelete : undefined}
          />
        </div>
        {isEditing('vaccination', index) ? (
          <div className='space-y-2'>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input value={item.name} aria-label='Vaccination name' onChange={handleNameChange} />
              <Input
                type='date'
                value={toLocalDateInputValue(item.administeredAt)}
                onChange={handleDateChange}
              />
            </div>
            <SingleCatSelect catName={item.catName} cats={cats} onChange={handleCatNameChange} />
          </div>
        ) : (
          <span>
            {item.name} · {formatDate(item.administeredAt)}
            {item.catName && ` · ${item.catName}`}
          </span>
        )}
        <ReviewStatusBadge
          label={
            likelyDuplicateVaccinations[index]
              ? 'Potential duplicate'
              : selections.vaccinationIds?.[index]
                ? 'Adds dose'
                : 'New'
          }
          message={
            likelyDuplicateVaccinations[index]
              ? 'This vaccination matches an existing dose for the same cat and administration time. Turn off Include to skip it, or leave it on to append it anyway.'
              : selections.vaccinationIds?.[index]
              ? 'This administration will be appended to the existing vaccination dose history.'
              : 'This proposal will create a new vaccination record.'
          }
          variant={likelyDuplicateVaccinations[index] ? 'warning' : 'success'}
          className='ml-2'
          badgePlacement='left'
        />
        {selections.vaccinationIds?.[index] && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className={mutedLinkClassName}
            onClick={handleUnmatchVaccination}
          >
            Create a new vaccination record instead
          </Button>
        )}
      </div>
    );
  }

  function renderPreventiveRow(item: IngestionDraft['proposedPreventives'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includePreventives', index);
    }
    function handleToggleEditingTarget() {
      toggleEditing('preventive', index);
    }
    function handleDelete() {
      removeItem('preventives', index);
    }
    function handleNameChange(event: { target: { value: string } }) {
      updatePreventiveAt(index, { name: event.target.value });
    }
    function handleDateChange(event: { target: { value: string } }) {
      const administeredAt = withUpdatedDate(item.administeredAt, event.target.value);
      if (administeredAt !== undefined) {
        updatePreventiveAt(index, { administeredAt });
      }
    }
    function handleCatNamesChange(catNames: string[]) {
      updatePreventiveAt(index, { catNames });
    }
    function handleUnmatchPreventive() {
      function clearPreventiveSelection(current: IngestionDraftSelections) {
        const values = [...(current.preventiveIds ?? [])];
        values[index] = null;
        return { ...current, preventiveIds: values };
      }
      setSelections(clearPreventiveSelection);
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includePreventives', index)} onToggle={handleToggleInclude} />
          <EditPencilButton
            editing={isEditing('preventive', index)}
            onClick={handleToggleEditingTarget}
            onDelete={isAddedItem('preventives', index) ? handleDelete : undefined}
          />
        </div>
        {isEditing('preventive', index) ? (
          <div className='space-y-2'>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input value={item.name} aria-label='Preventive name' onChange={handleNameChange} />
              <Input
                type='date'
                value={toLocalDateInputValue(item.administeredAt)}
                onChange={handleDateChange}
              />
            </div>
            <CatNamesEditor catNames={item.catNames} cats={cats} onChange={handleCatNamesChange} />
          </div>
        ) : (
          <span>
            {item.name} · {formatDate(item.administeredAt)}
            {item.catNames.length > 0 && ` · ${item.catNames.join(', ')}`}
          </span>
        )}
        <ReviewStatusBadge
          label={
            likelyDuplicatePreventives[index]
              ? 'Potential duplicate'
              : selections.preventiveIds?.[index]
                ? 'Adds dose'
                : 'New'
          }
          message={
            likelyDuplicatePreventives[index]
              ? 'This preventive matches an existing dose for the same cat(s) and administration time. Turn off Include to skip it, or leave it on to append it anyway.'
              : selections.preventiveIds?.[index]
              ? 'This administration will be appended to the existing preventive dose history.'
              : 'This proposal will create a new preventive record.'
          }
          variant={likelyDuplicatePreventives[index] ? 'warning' : 'success'}
          className='ml-2'
          badgePlacement='left'
        />
        {selections.preventiveIds?.[index] && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className={mutedLinkClassName}
            onClick={handleUnmatchPreventive}
          >
            Create a new preventive record instead
          </Button>
        )}
      </div>
    );
  }

  function renderWeightRow(item: IngestionDraft['proposedWeightEntries'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeWeightEntries', index);
    }
    function handleToggleEditingTarget() {
      toggleEditing('weight', index);
    }
    function handleDelete() {
      removeItem('weight', index);
    }
    function handleWeightChange(event: { target: { value: string } }) {
      updateWeightAt(index, { weight: Number(event.target.value) });
    }
    function handleDateChange(event: { target: { value: string } }) {
      const measuredAt = withUpdatedDate(item.measuredAt, event.target.value);
      if (measuredAt !== undefined) {
        updateWeightAt(index, { measuredAt });
      }
    }
    function handleCatNameChange(catName: string | null) {
      updateWeightAt(index, { catName });
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle
            included={isIncluded('includeWeightEntries', index)}
            onToggle={handleToggleInclude}
          />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={likelyDuplicateWeightEntries[index] ? 'Potential duplicate' : 'New'}
              message={
                likelyDuplicateWeightEntries[index]
                  ? 'This matches an existing measurement for this cat within one day. Turn off Include to skip it.'
                  : 'This proposal will create a new weight entry.'
              }
              variant={likelyDuplicateWeightEntries[index] ? 'warning' : 'success'}
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('weight', index)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('weight', index) ? handleDelete : undefined}
            />
          </div>
        </div>
        {isEditing('weight', index) ? (
          <div className='space-y-2'>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input type='number' value={item.weight} aria-label='Weight' onChange={handleWeightChange} />
              <Input
                type='date'
                value={toLocalDateInputValue(item.measuredAt)}
                onChange={handleDateChange}
              />
            </div>
            <SingleCatSelect catName={item.catName} cats={cats} onChange={handleCatNameChange} />
          </div>
        ) : (
          <span>
            {item.weight} {item.unit} · {formatDate(item.measuredAt)}
            {item.catName && ` · ${item.catName}`}
          </span>
        )}
      </div>
    );
  }

  function renderSymptomRow(item: IngestionDraft['proposedSymptoms'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeSymptoms', index);
    }
    function handleToggleEditingTarget() {
      toggleEditing('symptom', index);
    }
    function handleDelete() {
      removeItem('symptoms', index);
    }
    function handleDescriptionChange(event: { target: { value: string } }) {
      updateSymptomAt(index, { description: event.target.value });
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includeSymptoms', index)} onToggle={handleToggleInclude} />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={likelyDuplicateSymptoms[index] ? 'Potential duplicate' : 'New'}
              message={
                likelyDuplicateSymptoms[index]
                  ? 'The same symptom was already logged for this cat recently. Turn off Include to skip it.'
                  : 'This proposal will create a new symptom.'
              }
              variant={likelyDuplicateSymptoms[index] ? 'warning' : 'success'}
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('symptom', index)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('symptoms', index) ? handleDelete : undefined}
            />
          </div>
        </div>
        {isEditing('symptom', index) ? (
          <Input
            value={item.description}
            aria-label='Symptom description'
            onChange={handleDescriptionChange}
          />
        ) : (
          <span>
            {item.description}
            {item.catName && ` · ${item.catName}`}
          </span>
        )}
      </div>
    );
  }

  function renderConditionRow(item: IngestionDraft['proposedConditions'][number], index: number) {
    function handleToggleInclude() {
      toggleArrayInclude('includeConditions', index);
    }
    function handleToggleEditingTarget() {
      toggleEditing('condition', index);
    }
    function handleDelete() {
      removeItem('conditions', index);
    }
    function handleNameChange(event: { target: { value: string } }) {
      updateConditionAt(index, { name: event.target.value });
    }
    function handleUnmatchCondition() {
      function clearConditionSelection(current: IngestionDraftSelections) {
        const values = [...(current.conditionIds ?? [])];
        const libraryValues = [...(current.conditionLibraryIds ?? [])];
        values[index] = null;
        libraryValues[index] = null;
        return { ...current, conditionIds: values, conditionLibraryIds: libraryValues };
      }
      setSelections(clearConditionSelection);
    }

    return (
      <div key={index} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle included={isIncluded('includeConditions', index)} onToggle={handleToggleInclude} />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={
                selections.conditionIds?.[index]
                  ? 'Existing condition'
                  : matchedLibraryConditionIds[index]
                    ? 'Library match'
                    : 'New'
              }
              message={
                selections.conditionIds?.[index]
                  ? 'The visit will be linked to the existing ongoing condition.'
                  : matchedLibraryConditionIds[index]
                    ? 'This proposal will use the matching shared condition-library entry.'
                    : 'This proposal will create a new custom condition.'
              }
              variant='success'
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('condition', index)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('conditions', index) ? handleDelete : undefined}
            />
          </div>
        </div>
        {isEditing('condition', index) ? (
          <Input value={item.name} aria-label='Condition name' onChange={handleNameChange} />
        ) : (
          <span>
            {item.name}
            {item.catName && ` · ${item.catName}`}
          </span>
        )}
        {(selections.conditionIds?.[index] || matchedLibraryConditionIds[index]) && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className={mutedLinkClassName}
            onClick={handleUnmatchCondition}
          >
            Create a new custom condition instead
          </Button>
        )}
      </div>
    );
  }

  function renderExpenseRow(expense: IngestionDraft['proposedExpenses'][number], expenseIndex: number) {
    function sumItemAmounts(sum: number, item: { amount: number }) {
      return sum + item.amount;
    }
    const amount = expense.items.reduce(sumItemAmounts, 0);

    function handleToggleInclude() {
      toggleArrayInclude('includeExpenses', expenseIndex);
    }
    function handleToggleEditingTarget() {
      toggleEditing('expense', expenseIndex);
    }
    function handleDelete() {
      removeItem('expense', expenseIndex);
    }
    function toExpenseCategoryOption(category: (typeof DEFAULT_EXPENSE_CATEGORIES)[number]) {
      return { text: getExpenseCategoryLabel(category), value: category };
    }
    function handleCatNamesChange(catNames: string[]) {
      updateExpenseAt(expenseIndex, { catNames });
    }

    function renderExpenseItemRow(item: (typeof expense.items)[number], itemIndex: number) {
      function handleCategoryChange(value: string) {
        updateExpenseItemAt(expenseIndex, itemIndex, { category: value });
      }
      function handleLabelChange(event: { target: { value: string } }) {
        updateExpenseItemAt(expenseIndex, itemIndex, { label: event.target.value });
      }
      function handleAmountChange(event: { target: { value: string } }) {
        updateExpenseItemAt(expenseIndex, itemIndex, { amount: Number(event.target.value) });
      }

      return (
        <div key={itemIndex} className='flex flex-col gap-2 sm:flex-row'>
          <Select
            options={DEFAULT_EXPENSE_CATEGORIES.map(toExpenseCategoryOption)}
            value={item.category}
            onChange={handleCategoryChange}
          />
          <Input value={item.label ?? ''} placeholder='Line item label' onChange={handleLabelChange} />
          <Input type='number' value={item.amount} aria-label='Amount' onChange={handleAmountChange} />
        </div>
      );
    }

    function renderExpenseItemSummary(item: (typeof expense.items)[number], itemIndex: number) {
      return (
        <li key={itemIndex}>
          {item.label ?? getExpenseCategoryLabel(item.category)} · ${item.amount.toFixed(2)}
        </li>
      );
    }

    return (
      <div key={expenseIndex} className='space-y-2 rounded-md border border-border p-2'>
        <div className='flex items-center justify-between gap-2'>
          <IncludeToggle
            included={isIncluded('includeExpenses', expenseIndex)}
            onToggle={handleToggleInclude}
          />
          <div className='flex items-center gap-2'>
            <ReviewStatusBadge
              label={likelyDuplicateExpenses[expenseIndex] ? 'Potential duplicate' : 'New'}
              message={
                likelyDuplicateExpenses[expenseIndex]
                  ? 'This expense matches an existing charge for the same cat(s), date, total, and line-item breakdown. Turn off Include to skip it.'
                  : 'This proposal will create a new expense.'
              }
              variant={likelyDuplicateExpenses[expenseIndex] ? 'warning' : 'success'}
              badgePlacement='right'
            />
            <EditPencilButton
              editing={isEditing('expense', expenseIndex)}
              onClick={handleToggleEditingTarget}
              onDelete={isAddedItem('expense', expenseIndex) ? handleDelete : undefined}
            />
          </div>
        </div>
        <p className='text-sm'>
          ${amount.toFixed(2)} · {formatDate(expense.incurredAt)}
          {expense.catNames.length > 0 && ` · ${expense.catNames.join(', ')}`}
        </p>
        {isEditing('expense', expenseIndex) ? (
          <div className='space-y-2'>
            {expense.items.map(renderExpenseItemRow)}
            <CatNamesEditor catNames={expense.catNames} cats={cats} onChange={handleCatNamesChange} />
          </div>
        ) : (
          expense.items.length > 1 && (
            <ul className='space-y-1 text-sm text-muted-foreground'>
              {expense.items.map(renderExpenseItemSummary)}
            </ul>
          )
        )}
      </div>
    );
  }

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
            onSelect={handleSelectProgressPill}
          />
          <p className='text-sm'>
            <span className='text-success'>
              {newCount} new item{newCount === 1 ? '' : 's'}
            </span>
            {duplicateCount > 0 && (
              <span className='text-warning'>
                {' · '}
                {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} detected
              </span>
            )}
          </p>
          <DropdownMenu
            items={addItemMenuItems}
            onItemSelect={handleSelectAddItemMenu}
            placement='bottom'
            alignment='end'
            offset={8}
            trigger={
              <Button type='button' variant='link' size='sm' className={join(mutedLinkClassName, 'gap-1')}>
                <Plus className='h-3.5 w-3.5' /> Add item <ChevronDown className='h-3.5 w-3.5' />
              </Button>
            }
          />
        </div>
      </div>

      <div className='mt-3 max-h-[65vh] min-h-[40vh] space-y-3 overflow-y-auto pr-1'>
        {draft.proposedCats.length > 0 && (
          <Section title='Cats' section='cat' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedCats.map(renderCatRow)}
          </Section>
        )}

        {draft.proposedClinics.length > 0 && (
          <Section title='Vet clinics' section='clinic' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedClinics.map(renderClinicRow)}
          </Section>
        )}

        {draft.proposedVisits.length > 0 && (
          <Section title='Visits' section='visit' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedVisits.map(renderVisitRow)}
          </Section>
        )}

        {draft.proposedVaccinations.length > 0 && (
          <Section title='Vaccinations' section='vaccinations' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedVaccinations.map(renderVaccinationRow)}
          </Section>
        )}

        {draft.proposedPreventives.length > 0 && (
          <Section title='Preventives' section='preventives' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedPreventives.map(renderPreventiveRow)}
          </Section>
        )}

        {draft.proposedWeightEntries.length > 0 && (
          <Section title='Weight' section='weight' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedWeightEntries.map(renderWeightRow)}
          </Section>
        )}

        {draft.proposedSymptoms.length > 0 && (
          <Section title='Symptoms' section='symptoms' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedSymptoms.map(renderSymptomRow)}
          </Section>
        )}

        {draft.proposedConditions.length > 0 && (
          <Section title='Conditions' section='conditions' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedConditions.map(renderConditionRow)}
          </Section>
        )}

        {draft.proposedExpenses.length > 0 && (
          <Section title='Expenses' section='expense' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedExpenses.map(renderExpenseRow)}
          </Section>
        )}

        {error && <p className='text-sm text-red-500'>{error}</p>}
      </div>

      <div className='mt-3 space-y-2 border-t border-border pt-3'>
        <IncludeToggle
          label='Save as a permanent health record'
          included={Boolean(file) && selections.saveAsRecord !== false}
          onToggle={function handleToggleSaveAsRecord() {
            function flipSaveAsRecord(current: IngestionDraftSelections) {
              return { ...current, saveAsRecord: current.saveAsRecord === false };
            }
            setSelections(flipSaveAsRecord);
          }}
          disabled={!file}
        />
        <p className='text-muted-foreground text-sm'>
          {file
            ? 'Keep the uploaded file attached to the confirmed visit.'
            : "The original file isn't available to save — re-upload the document to keep it as a record."}
        </p>
        {file && selections.saveAsRecord !== false && (
          <>
            {recordLabelOpen ? (
              <Input
                value={recordLabel}
                aria-label='Record label'
                placeholder='e.g. Rabies certificate photo'
                onChange={function handleRecordLabelChange(event) {
                  setRecordLabel(event.target.value);
                }}
              />
            ) : (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={function handleOpenRecordLabel() {
                  setRecordLabelOpen(true);
                }}
              >
                + Add label
              </Button>
            )}
            <RecordTypeField
              value={recordTypeChoice}
              onValueChange={setRecordTypeChoice}
              householdId={householdId}
            />
          </>
        )}
      </div>

      <p className='mt-3 text-sm text-muted-foreground'>
        {newCount} new item{newCount === 1 ? '' : 's'} will be created.
      </p>
      <div className='mt-2 flex flex-wrap justify-between gap-2'>
        <Button type='button' variant='destructive' disabled={isSubmitting} onClick={handleDiscardClick}>
          Discard
        </Button>
        <div className='flex gap-2'>
          <Button type='button' variant='secondary' disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type='button' loading={isSubmitting} onClick={handleConfirmClick}>
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default IngestionDraftReviewModal;
