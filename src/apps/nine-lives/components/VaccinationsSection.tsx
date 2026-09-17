import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';

import { useAttentionFocus } from '../context/attentionFocusContext';
import {
  createVaccination,
  deleteVaccination,
  deleteVaccinationDose,
  logVaccinationDose,
  updateVaccination,
  type VaccinationFormSubmission,
} from '../store/actions/vaccinationsActions';
import { selectVaccinationsByCat } from '../store/selectors';
import type { Vaccination } from '../types';
import VaccinationFormModal, { type VaccinationFormInitialValues } from './VaccinationFormModal';
import VaccinationTimeline from './VaccinationTimeline';

/** Flattens a record + its latest dose into the form's prefill shape. `mode: 'log-dose'` blanks the administered/expires/linked-visit fields to today/none rather than carrying the prior dose's own values forward. */
function buildInitialValues(
  vaccination: Vaccination,
  mode: 'edit' | 'log-dose',
): VaccinationFormInitialValues {
  const latestDose = vaccination.history[0];

  return {
    id: mode === 'edit' ? vaccination.id : undefined,
    catId: vaccination.catId,
    name: vaccination.name,
    administeredAt: mode === 'log-dose' ? Date.now() : latestDose.administeredAt,
    expiresAt: mode === 'log-dose' ? null : latestDose.expiresAt,
    clinicId: latestDose.clinicId,
    doctorId: latestDose.doctorId,
    lotNumber: latestDose.lotNumber,
    linkedVisitId: mode === 'log-dose' ? null : latestDose.linkedVisitId,
  };
}

interface VaccinationsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function VaccinationsSection({ householdId, catId, catName }: VaccinationsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { focusRequest } = useAttentionFocus();
  const vaccinations = useAppSelector(selectVaccinationsByCat(catId), shallowEqual);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVaccination, setEditingVaccination] = useState<Vaccination | null>(null);
  const [loggingDoseFor, setLoggingDoseFor] = useState<Vaccination | null>(null);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [handledFocusRequestedAt, setHandledFocusRequestedAt] = useState<number | undefined>(undefined);

  if (focusRequest?.kind === 'vaccination-log-dose' && focusRequest.requestedAt !== handledFocusRequestedAt) {
    setHandledFocusRequestedAt(focusRequest.requestedAt);

    const target = vaccinations.find((vaccination) => vaccination.id === focusRequest.vaccinationId);

    if (target) {
      setEditingVaccination(null);
      setLoggingDoseFor(target);
      setIsModalOpen(true);
    }
  }

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingVaccination(null);
    setLoggingDoseFor(null);
  };

  const handleSubmit = async (vaccination: VaccinationFormSubmission) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (loggingDoseFor) {
        await dispatch(
          logVaccinationDose({
            householdId,
            vaccinationId: loggingDoseFor.id,
            uid: user.uid,
            dose: vaccination,
          }),
        ).unwrap();
      } else if (editingVaccination) {
        await dispatch(
          updateVaccination({
            householdId,
            vaccinationId: editingVaccination.id,
            uid: user.uid,
            changes: vaccination,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createVaccination({ householdId, catId, uid: user.uid, vaccination }),
        ).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (vaccinationId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteVaccination({ householdId, vaccinationId })).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDose = async (vaccinationId: string, doseId: string) => {
    const confirmed = await confirm({
      title: 'Delete dose',
      message: 'Are you sure you want to delete this dose from the history?',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    const result = await dispatch(
      deleteVaccinationDose({ householdId, vaccinationId, doseId, uid: user?.uid }),
    ).unwrap();

    if (result.deletedRecord) {
      setHistoryRecordId(null);
    }
  };

  const historyRecord = historyRecordId
    ? (vaccinations.find((vaccination) => vaccination.id === historyRecordId) ?? null)
    : null;

  const formInitialValues: VaccinationFormInitialValues | undefined = loggingDoseFor
    ? buildInitialValues(loggingDoseFor, 'log-dose')
    : editingVaccination
      ? buildInitialValues(editingVaccination, 'edit')
      : undefined;

  const activeRecordId = editingVaccination?.id ?? loggingDoseFor?.id ?? historyRecordId ?? null;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s vaccinations here.</small>
        <Button
          type='button'
          variant='primary'
          size='sm'
          onClick={() => {
            setEditingVaccination(null);
            setLoggingDoseFor(null);
            setIsModalOpen(true);
          }}
        >
          <span className='hidden sm:inline'>Add vaccination</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>

      <VaccinationTimeline
        vaccinations={vaccinations}
        activeRecordId={activeRecordId}
        onEdit={(vaccination) => {
          setEditingVaccination(vaccination);
          setLoggingDoseFor(null);
          setIsModalOpen(true);
        }}
        onLogDose={(vaccination) => {
          setEditingVaccination(null);
          setLoggingDoseFor(vaccination);
          setIsModalOpen(true);
        }}
        onViewHistory={(vaccination) => setHistoryRecordId(vaccination.id)}
      />

      <VaccinationFormModal
        key={editingVaccination?.id ?? loggingDoseFor?.id ?? 'new'}
        isOpen={isModalOpen}
        householdId={householdId}
        catName={catName}
        title={loggingDoseFor ? `Mark ${loggingDoseFor.name} administered today` : undefined}
        initialVaccination={formInitialValues}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingVaccination ? handleDelete : undefined}
        onClose={closeModal}
      />

      <Modal
        isOpen={Boolean(historyRecord)}
        onClose={() => setHistoryRecordId(null)}
        title={historyRecord ? `${historyRecord.name} history` : 'History'}
      >
        {historyRecord && (
          <div className='divide-border divide-y'>
            {historyRecord.history.map((dose) => (
              <div key={dose.id} className='flex items-start justify-between gap-3 py-2 first:pt-0'>
                <div className='min-w-0 text-sm'>
                  <div>Administered: {formatDateTime(dose.administeredAt)}</div>
                  {dose.expiresAt ? <div className='text-muted-foreground'>Next due: {formatDateTime(dose.expiresAt)}</div> : null}
                  {dose.lotNumber ? <div className='text-muted-foreground'>Lot: {dose.lotNumber}</div> : null}
                </div>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  onClick={() => void handleDeleteDose(historyRecord.id, dose.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default VaccinationsSection;
