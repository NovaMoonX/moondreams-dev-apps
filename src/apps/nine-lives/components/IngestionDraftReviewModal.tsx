import { useMemo, useState } from 'react';

import { Button, Input, Modal, Select } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';

import {
  confirmIngestionDraft,
  discardIngestionDraft,
  updateIngestionDraft,
  type IngestionDraftSelections,
} from '../store/actions/ingestionDraftsActions';
import { selectCatsByHousehold, selectClinicsByHousehold } from '../store/selectors';
import type { IngestionDraft } from '../types';

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
  | 'expense'
  | 'record';

function ToggleProposal({
  included,
  onToggle,
}: {
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <Button type='button' size='sm' variant={included ? 'primary' : 'secondary'} onClick={onToggle}>
      {included ? 'Included' : 'Excluded'}
    </Button>
  );
}

function Section({
  title,
  section,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  section: ReviewSection;
  expanded: ReviewSection;
  onToggle: (section: ReviewSection) => void;
  children: React.ReactNode;
}) {
  const isExpanded = expanded === section;

  return (
    <div className='border-b border-border pb-3'>
      <Button
        type='button'
        variant='link'
        className='w-full justify-between px-0 text-left'
        onClick={() => onToggle(section)}
      >
        <span className='font-medium'>{title}</span>
        <span className='text-muted-foreground text-xs'>{isExpanded ? 'Hide' : 'Show'}</span>
      </Button>
      {isExpanded && <div className='space-y-3 pt-2'>{children}</div>}
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
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const clinics = useAppSelector(selectClinicsByHousehold(householdId), shallowEqual);
  const [expanded, setExpanded] = useState<ReviewSection>(intent === 'expense' ? 'expense' : intent === 'record' ? 'record' : 'visit');
  const [selections, setSelections] = useState<IngestionDraftSelections>({
    includeCat: Boolean(draft.proposedCat),
    includeClinic: Boolean(draft.proposedClinic),
    includeVisit: Boolean(draft.proposedVisit),
    includeWeightEntry: Boolean(draft.proposedWeightEntry),
    includeExpense: Boolean(draft.proposedExpense),
    saveAsRecord: draft.suggestKeepAsRecord,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catOptions = useMemo(
    () => [
      { text: `Create new: ${draft.proposedCat?.name ?? 'cat'}`, value: '' },
      ...cats.map((cat) => ({ text: cat.name, value: cat.id })),
    ],
    [cats, draft.proposedCat?.name],
  );
  const clinicOptions = useMemo(
    () => [
      { text: `Create new: ${draft.proposedClinic?.name ?? 'clinic'}`, value: '' },
      ...clinics.map((clinic) => ({ text: clinic.name, value: clinic.id })),
    ],
    [clinics, draft.proposedClinic?.name],
  );

  const toggleItem = (
    key: 'includeVaccinations' | 'includePreventives' | 'includeSymptoms' | 'includeConditions',
    index: number,
  ) => {
    setSelections((current) => {
      const values = [...(current[key] ?? [])];
      values[index] = values[index] !== false ? false : true;
      return { ...current, [key]: values };
    });
  };

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await dispatch(
        updateIngestionDraft({
          householdId,
          draftId: draft.id,
          changes: {
            proposedCat: draft.proposedCat,
            proposedClinic: draft.proposedClinic,
            proposedVisit: draft.proposedVisit,
            proposedExpense: draft.proposedExpense,
            suggestKeepAsRecord: selections.saveAsRecord ?? false,
          },
        }),
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

  const toggleSection = (section: ReviewSection) => {
    setExpanded((current) => (current === section ? 'record' : section));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Review extracted records'>
      <div className='max-h-[70vh] space-y-3 overflow-y-auto pr-1'>
        <p className='text-muted-foreground text-sm'>
          {draft.sourceFileName}
          {draft.confidence !== null && ` · ${Math.round(draft.confidence * 100)}% confidence`}
        </p>

        {draft.proposedCat && (
          <Section title='Cat' section='cat' expanded={expanded} onToggle={toggleSection}>
            <ToggleProposal
              included={selections.includeCat !== false}
              onToggle={() => setSelections((current) => ({ ...current, includeCat: current.includeCat === false }))}
            />
            <Input
              value={draft.proposedCat.name}
              aria-label='Proposed cat name'
              onChange={(event) =>
                void dispatch(updateIngestionDraft({
                  householdId,
                  draftId: draft.id,
                  changes: { proposedCat: { ...draft.proposedCat, name: event.target.value } },
                }))
              }
            />
            <Select
              options={catOptions}
              value={selections.catId ?? ''}
              placeholder='Create new cat'
              onChange={(value) => setSelections((current) => ({ ...current, catId: value || null }))}
            />
          </Section>
        )}

        {draft.proposedClinic && (
          <Section title='Vet clinic' section='clinic' expanded={expanded} onToggle={toggleSection}>
            <ToggleProposal
              included={selections.includeClinic !== false}
              onToggle={() => setSelections((current) => ({ ...current, includeClinic: current.includeClinic === false }))}
            />
            <Input
              value={draft.proposedClinic.name}
              aria-label='Proposed clinic name'
              onChange={(event) =>
                void dispatch(updateIngestionDraft({
                  householdId,
                  draftId: draft.id,
                  changes: { proposedClinic: { ...draft.proposedClinic, name: event.target.value } },
                }))
              }
            />
            <Select
              options={clinicOptions}
              value={selections.clinicId ?? ''}
              placeholder='Create new clinic'
              onChange={(value) => setSelections((current) => ({ ...current, clinicId: value || null }))}
            />
          </Section>
        )}

        {draft.proposedVisit && (
          <Section title='Visit' section='visit' expanded={expanded} onToggle={toggleSection}>
            <ToggleProposal
              included={selections.includeVisit !== false}
              onToggle={() => setSelections((current) => ({ ...current, includeVisit: current.includeVisit === false }))}
            />
            <p className='text-muted-foreground text-sm'>
              {formatDateTime(draft.proposedVisit.scheduledAt)} · {draft.proposedVisit.reason}
            </p>
            <Input
              value={draft.proposedVisit.notes ?? ''}
              placeholder='Visit notes'
              onChange={(event) =>
                void dispatch(updateIngestionDraft({
                  householdId,
                  draftId: draft.id,
                  changes: { proposedVisit: { ...draft.proposedVisit, notes: event.target.value } },
                }))
              }
            />
          </Section>
        )}

        {draft.proposedVaccinations.length > 0 && (
          <Section title='Vaccinations' section='vaccinations' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedVaccinations.map((item, index) => (
              <div className='flex items-center justify-between gap-2' key={`${item.name}-${index}`}>
                <span>{item.name} · {formatDateTime(item.administeredAt)}</span>
                <ToggleProposal
                  included={selections.includeVaccinations?.[index] !== false}
                  onToggle={() => toggleItem('includeVaccinations', index)}
                />
              </div>
            ))}
          </Section>
        )}

        {draft.proposedPreventives.length > 0 && (
          <Section title='Preventives' section='preventives' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedPreventives.map((item, index) => (
              <div className='flex items-center justify-between gap-2' key={`${item.name}-${index}`}>
                <span>{item.name} · {formatDateTime(item.administeredAt)}</span>
                <ToggleProposal
                  included={selections.includePreventives?.[index] !== false}
                  onToggle={() => toggleItem('includePreventives', index)}
                />
              </div>
            ))}
          </Section>
        )}

        {draft.proposedWeightEntry && (
          <Section title='Weight' section='weight' expanded={expanded} onToggle={toggleSection}>
            <div className='flex items-center justify-between gap-2'>
              <span>{draft.proposedWeightEntry.weight} {draft.proposedWeightEntry.unit}</span>
              <ToggleProposal
                included={selections.includeWeightEntry !== false}
                onToggle={() => setSelections((current) => ({ ...current, includeWeightEntry: current.includeWeightEntry === false }))}
              />
            </div>
          </Section>
        )}

        {draft.proposedSymptoms.length > 0 && (
          <Section title='Symptoms' section='symptoms' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedSymptoms.map((item, index) => (
              <div className='flex items-center justify-between gap-2' key={`${item.description}-${index}`}>
                <span>{item.description}</span>
                <ToggleProposal
                  included={selections.includeSymptoms?.[index] !== false}
                  onToggle={() => toggleItem('includeSymptoms', index)}
                />
              </div>
            ))}
          </Section>
        )}

        {draft.proposedConditions.length > 0 && (
          <Section title='Conditions' section='conditions' expanded={expanded} onToggle={toggleSection}>
            {draft.proposedConditions.map((item, index) => (
              <div className='flex items-center justify-between gap-2' key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <ToggleProposal
                  included={selections.includeConditions?.[index] !== false}
                  onToggle={() => toggleItem('includeConditions', index)}
                />
              </div>
            ))}
          </Section>
        )}

        {draft.proposedExpense && (
          <Section title='Expense' section='expense' expanded={expanded} onToggle={toggleSection}>
            <ToggleProposal
              included={selections.includeExpense !== false}
              onToggle={() => setSelections((current) => ({ ...current, includeExpense: current.includeExpense === false }))}
            />
            <p>{draft.proposedExpense.label ?? draft.proposedExpense.category} · ${draft.proposedExpense.amount.toFixed(2)}</p>
          </Section>
        )}

        <Section title='Permanent health record' section='record' expanded={expanded} onToggle={toggleSection}>
          <ToggleProposal
            included={selections.saveAsRecord !== false}
            onToggle={() => setSelections((current) => ({ ...current, saveAsRecord: current.saveAsRecord === false }))}
          />
          <p className='text-muted-foreground text-sm'>Keep the uploaded file attached to the confirmed visit.</p>
        </Section>
        {error && <p className='text-sm text-red-500'>{error}</p>}
      </div>
      <div className='mt-4 flex flex-wrap justify-between gap-2'>
        <Button type='button' variant='secondary' disabled={isSubmitting} onClick={() => void handleDiscard()}>
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
