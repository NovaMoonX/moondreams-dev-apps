import { useState, type ReactNode } from 'react';

import { Button, Disclosure, Input, Modal, Select, Toggle } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Activity,
  Calendar,
  Cat,
  Check,
  Hospital,
  Pencil,
  Pill,
  Receipt,
  Scale,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateTime } from '@/utils/formatUtils';

import {
  confirmIngestionDraft,
  discardIngestionDraft,
  updateIngestionDraft,
  type IngestionDraftSelections,
} from '../store/actions/ingestionDraftsActions';
import { selectCatsByHousehold, selectClinicsByHousehold } from '../store/selectors';
import { DEFAULT_EXPENSE_CATEGORIES, getExpenseCategoryLabel } from '../utils/budgetCalculators';
import type { CatSex, IngestionDraft } from '../types';

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

const SEX_OPTIONS = [
  { text: 'Unknown', value: 'unknown' },
  { text: 'Male', value: 'male' },
  { text: 'Female', value: 'female' },
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

const SECTION_ICONS: Record<ReviewSection, LucideIcon> = {
  cat: Cat,
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
  | 'includeSymptoms'
  | 'includeConditions'
  | 'includeExpenses';

interface EditingKey {
  section: 'visit' | 'vaccination' | 'preventive' | 'weight' | 'expense';
  index: number;
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
    ...(draft.proposedWeightEntry ? (['weight'] as const) : []),
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
  const [pickingExisting, setPickingExisting] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<IngestionDraftSelections>({
    saveAsRecord: draft.suggestKeepAsRecord,
  });
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
  const updateWeight = (patch: Partial<NonNullable<IngestionDraft['proposedWeightEntry']>>) =>
    draft.proposedWeightEntry &&
    updateDraft({ proposedWeightEntry: { ...draft.proposedWeightEntry, ...patch } });
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

  const totalCount =
    draft.proposedCats.length +
    draft.proposedClinics.length +
    draft.proposedVisits.length +
    draft.proposedVaccinations.length +
    draft.proposedPreventives.length +
    (draft.proposedWeightEntry ? 1 : 0) +
    draft.proposedSymptoms.length +
    draft.proposedConditions.length +
    draft.proposedExpenses.length;
  const includedCount =
    draft.proposedCats.filter((_, i) => isIncluded('includeCats', i)).length +
    draft.proposedClinics.filter((_, i) => isIncluded('includeClinics', i)).length +
    draft.proposedVisits.filter((_, i) => isIncluded('includeVisits', i)).length +
    draft.proposedVaccinations.filter((_, i) => isIncluded('includeVaccinations', i)).length +
    draft.proposedPreventives.filter((_, i) => isIncluded('includePreventives', i)).length +
    (draft.proposedWeightEntry && selections.includeWeightEntry !== false ? 1 : 0) +
    draft.proposedSymptoms.filter((_, i) => isIncluded('includeSymptoms', i)).length +
    draft.proposedConditions.filter((_, i) => isIncluded('includeConditions', i)).length +
    draft.proposedExpenses.filter((_, i) => isIncluded('includeExpenses', i)).length;

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
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
          {draft.confidence !== null && ` · ${Math.round(draft.confidence * 100)}% confidence`}
        </p>
        <ReviewProgressPills
          sections={sectionsWithContent}
          reviewed={reviewed}
          expanded={expanded}
          onSelect={toggleSection}
        />
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
                      onChange={(event) => updateCatAt(index, { name: event.target.value })}
                    />
                    <Select
                      options={SEX_OPTIONS}
                      value={cat.sex ?? 'unknown'}
                      onChange={(value) => updateCatAt(index, { sex: value as CatSex })}
                    />
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
                <p className='text-muted-foreground text-sm'>
                  {formatDateTime(visit.scheduledAt)} · {visit.reason}
                  {visit.catName && ` · ${visit.catName}`}
                  {visit.clinicName && ` · ${visit.clinicName}`}
                </p>
                {isEditing('visit', index) ? (
                  <Input
                    value={visit.notes ?? ''}
                    placeholder='Visit notes'
                    onChange={(event) => updateVisitAt(index, { notes: event.target.value })}
                  />
                ) : (
                  visit.notes && <p className='text-sm'>{visit.notes}</p>
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
                  <div className='flex flex-col gap-2 sm:flex-row'>
                    <Input
                      value={item.name}
                      aria-label='Vaccination name'
                      onChange={(event) => updateVaccinationAt(index, { name: event.target.value })}
                    />
                    <Input
                      type='date'
                      value={toDateInputValue(item.administeredAt)}
                      onChange={(event) => {
                        const administeredAt = fromDateInputValue(event.target.value);
                        if (administeredAt !== undefined) {
                          updateVaccinationAt(index, { administeredAt });
                        }
                      }}
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
                  <div className='flex flex-col gap-2 sm:flex-row'>
                    <Input
                      value={item.name}
                      aria-label='Preventive name'
                      onChange={(event) => updatePreventiveAt(index, { name: event.target.value })}
                    />
                    <Input
                      type='date'
                      value={toDateInputValue(item.administeredAt)}
                      onChange={(event) => {
                        const administeredAt = fromDateInputValue(event.target.value);
                        if (administeredAt !== undefined) {
                          updatePreventiveAt(index, { administeredAt });
                        }
                      }}
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

        {draft.proposedWeightEntry && (
          <Section title='Weight' section='weight' expanded={expanded} onToggle={toggleSection}>
            <div className='space-y-2 rounded-md border border-border p-2'>
              <div className='flex items-center justify-between gap-2'>
                <IncludeToggle
                  included={selections.includeWeightEntry !== false}
                  onToggle={() =>
                    setSelections((current) => ({ ...current, includeWeightEntry: current.includeWeightEntry === false }))
                  }
                />
                <EditPencilButton editing={isEditing('weight', 0)} onClick={() => toggleEditing('weight', 0)} />
              </div>
              {isEditing('weight', 0) ? (
                <div className='flex flex-col gap-2 sm:flex-row'>
                  <Input
                    type='number'
                    value={draft.proposedWeightEntry.weight}
                    aria-label='Weight'
                    onChange={(event) => updateWeight({ weight: Number(event.target.value) })}
                  />
                  <Input
                    type='date'
                    value={toDateInputValue(draft.proposedWeightEntry.measuredAt)}
                    onChange={(event) => {
                      const measuredAt = fromDateInputValue(event.target.value);
                      if (measuredAt !== undefined) {
                        updateWeight({ measuredAt });
                      }
                    }}
                  />
                </div>
              ) : (
                <span>
                  {draft.proposedWeightEntry.weight} {draft.proposedWeightEntry.unit}
                  {draft.proposedWeightEntry.catName && ` · ${draft.proposedWeightEntry.catName}`}
                </span>
              )}
            </div>
          </Section>
        )}

        {draft.proposedSymptoms.length > 0 && (
          <Section title='Symptoms' section='symptoms' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedSymptoms.map((item, index) => (
              <div className='flex items-center justify-between gap-2' key={index}>
                <span>
                  {item.description}
                  {item.catName && ` · ${item.catName}`}
                </span>
                <IncludeToggle included={isIncluded('includeSymptoms', index)} onToggle={() => toggleArrayInclude('includeSymptoms', index)} />
              </div>
            ))}
          </Section>
        )}

        {draft.proposedConditions.length > 0 && (
          <Section title='Conditions' section='conditions' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedConditions.map((item, index) => (
              <div className='flex items-center justify-between gap-2' key={index}>
                <span>
                  {item.name}
                  {item.catName && ` · ${item.catName}`}
                </span>
                <IncludeToggle included={isIncluded('includeConditions', index)} onToggle={() => toggleArrayInclude('includeConditions', index)} />
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

      <div className='mt-3 space-y-1 border-t border-border pt-3'>
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
