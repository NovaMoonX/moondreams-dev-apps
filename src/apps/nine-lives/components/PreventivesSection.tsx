import { useMemo, useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';

import { useAttentionFocus } from '../context/attentionFocusContext';
import {
  createPreventive,
  deletePreventive,
  deletePreventiveDose,
  logPreventiveDose,
  updatePreventive,
  type PreventiveFormSubmission,
} from '../store/actions/preventivesActions';
import {
  selectCustomPreventiveTypesByHousehold,
  selectPreventivesByCat,
} from '../store/selectors';
import type { Cat, Preventive } from '../types';
import PreventiveFormModal, { type PreventiveFormInitialValues } from './PreventiveFormModal';
import PreventiveTimeline from './PreventiveTimeline';

/** Flattens a record + its latest dose into the form's prefill shape. `mode: 'log-dose'` blanks the administered/expires/linked-visit fields to today/none rather than carrying the prior dose's own values forward. */
function buildInitialValues(preventive: Preventive, mode: 'edit' | 'log-dose'): PreventiveFormInitialValues {
  const latestDose = preventive.history[0];

  return {
    id: mode === 'edit' ? preventive.id : undefined,
    catIds: preventive.catIds,
    name: preventive.name,
    customProductId: preventive.customProductId,
    type: preventive.type,
    customTypeId: preventive.customTypeId,
    administeredAt: mode === 'log-dose' ? Date.now() : latestDose.administeredAt,
    expiresAt: mode === 'log-dose' ? null : latestDose.expiresAt,
    dosage: latestDose.dosage,
    clinicId: latestDose.clinicId,
    doctorId: latestDose.doctorId,
    linkedVisitId: mode === 'log-dose' ? null : latestDose.linkedVisitId,
  };
}

interface PreventivesSectionProps {
  householdId: string;
  catId: string;
  catName: string;
  cats: Cat[];
}

function PreventivesSection({ householdId, catId, catName, cats }: PreventivesSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { focusRequest } = useAttentionFocus();
  const preventives = useAppSelector(selectPreventivesByCat(catId), shallowEqual);
  const customTypes = useAppSelector(
    selectCustomPreventiveTypesByHousehold(householdId),
    shallowEqual,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPreventive, setEditingPreventive] = useState<Preventive | null>(null);
  const [loggingDoseFor, setLoggingDoseFor] = useState<Preventive | null>(null);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [handledFocusRequestedAt, setHandledFocusRequestedAt] = useState<number | undefined>(undefined);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  if (focusRequest?.kind === 'preventive-log-dose' && focusRequest.requestedAt !== handledFocusRequestedAt) {
    setHandledFocusRequestedAt(focusRequest.requestedAt);

    const target = preventives.find((preventive) => preventive.id === focusRequest.preventiveId);

    if (target) {
      setEditingPreventive(null);
      setLoggingDoseFor(target);
      setIsModalOpen(true);
    }
  }

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPreventive(null);
    setLoggingDoseFor(null);
  };

  const handleSubmit = async (preventive: PreventiveFormSubmission) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (loggingDoseFor) {
        await dispatch(
          logPreventiveDose({
            householdId,
            preventiveId: loggingDoseFor.id,
            uid: user.uid,
            dose: preventive,
          }),
        ).unwrap();
      } else if (editingPreventive) {
        await dispatch(
          updatePreventive({
            householdId,
            preventiveId: editingPreventive.id,
            changes: preventive,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createPreventive({ householdId, uid: user.uid, preventive }),
        ).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (preventiveId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deletePreventive({ householdId, preventiveId })).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDose = async (preventiveId: string, doseId: string) => {
    const confirmed = await confirm({
      title: 'Delete dose',
      message: 'Are you sure you want to delete this dose from the history?',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    const result = await dispatch(
      deletePreventiveDose({ householdId, preventiveId, doseId }),
    ).unwrap();

    if (result.deletedRecord) {
      setHistoryRecordId(null);
    }
  };

  const openCreate = () => {
    setEditingPreventive(null);
    setLoggingDoseFor(null);
    setIsModalOpen(true);
  };

  const openEdit = (preventive: Preventive) => {
    setEditingPreventive(preventive);
    setLoggingDoseFor(null);
    setIsModalOpen(true);
  };

  const openLogDose = (preventive: Preventive) => {
    setEditingPreventive(null);
    setLoggingDoseFor(preventive);
    setIsModalOpen(true);
  };

  const historyRecord = historyRecordId
    ? (preventives.find((preventive) => preventive.id === historyRecordId) ?? null)
    : null;

  const formInitialValues: PreventiveFormInitialValues | undefined = loggingDoseFor
    ? buildInitialValues(loggingDoseFor, 'log-dose')
    : editingPreventive
      ? buildInitialValues(editingPreventive, 'edit')
      : undefined;

  const activeRecordId = editingPreventive?.id ?? loggingDoseFor?.id ?? historyRecordId ?? null;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>
          Track {catName}&rsquo;s preventives and medications here.
        </small>
        <Button type='button' variant='primary' size='sm' onClick={openCreate}>
          <span className='hidden sm:inline'>Add preventive / med</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>
      <PreventiveTimeline
        preventives={preventives}
        customTypes={customTypes}
        cats={cats}
        catId={catId}
        activeRecordId={activeRecordId}
        onEdit={openEdit}
        onLogDose={openLogDose}
        onViewHistory={(preventive) => setHistoryRecordId(preventive.id)}
      />
      {user?.uid && (
        <PreventiveFormModal
          key={editingPreventive?.id ?? loggingDoseFor?.id ?? 'new'}
          isOpen={isModalOpen}
          householdId={householdId}
          uid={user.uid}
          catOptions={catOptions}
          defaultCatIds={[catId]}
          title={loggingDoseFor ? `Mark ${loggingDoseFor.name} administered today` : undefined}
          initialPreventive={formInitialValues}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onDelete={editingPreventive ? handleDelete : undefined}
          onClose={closeModal}
        />
      )}

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
                  {dose.dosage ? <div className='text-muted-foreground'>Dosage: {dose.dosage}</div> : null}
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

export default PreventivesSection;
