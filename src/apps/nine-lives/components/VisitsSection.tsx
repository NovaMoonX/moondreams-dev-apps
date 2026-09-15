import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  cancelVisit,
  completeVisit,
  createVisit,
  deleteVisit,
  updateVisit,
  type VisitOutcome,
} from '../store/actions/visitsActions';
import {
  selectCatsByHousehold,
  selectClinicsByHousehold,
  selectDoctorsByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import type { Visit } from '../types';
import VisitFormModal from './VisitFormModal';
import VisitTimeline from './VisitTimeline';

interface VisitsSectionProps {
  householdId: string;
}

type VisitModalMode = 'create' | 'edit' | 'complete' | null;

function VisitsSection({ householdId }: VisitsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const cats = useAppSelector(selectCatsByHousehold(householdId));
  const clinics = useAppSelector(selectClinicsByHousehold(householdId));
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId));
  const visits = useAppSelector(selectVisitsByHousehold(householdId));
  const [modalMode, setModalMode] = useState<VisitModalMode>(null);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeModal = () => {
    setModalMode(null);
    setSelectedVisit(null);
  };

  const handleSubmit = async (
    visit: Partial<Visit> & Pick<Visit, 'catIds' | 'reason' | 'scheduledAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedVisit) {
        await dispatch(
          updateVisit({
            householdId,
            visitId: selectedVisit.id,
            changes: visit,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createVisit({ householdId, uid: user.uid, visit }),
        ).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async (outcome: VisitOutcome = {}) => {
    if (!user?.uid || !selectedVisit) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        completeVisit({
          householdId,
          uid: user.uid,
          visitId: selectedVisit.id,
          outcome,
        }),
      ).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedVisit) {
      return;
    }

    const confirmed = await confirm({
      title: 'Cancel visit',
      message: 'Are you sure you want to cancel this upcoming visit?',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        cancelVisit({ householdId, visitId: selectedVisit.id }),
      ).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedVisit) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        deleteVisit({ householdId, visitId: selectedVisit.id }),
      ).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <div>
          <h2 className='text-xl font-semibold'>Visits</h2>
          <p className='text-muted-foreground text-sm'>
            Keep track of every vet visit, big or small.
          </p>
        </div>
        <Button
          type='button'
          disabled={cats.length === 0}
          onClick={() => {
            setSelectedVisit(null);
            setModalMode('create');
          }}
        >
          Log visit
        </Button>
      </div>

      <VisitTimeline
        visits={visits}
        cats={cats}
        onEdit={(visit) => {
          setSelectedVisit(visit);
          setModalMode('edit');
        }}
        onComplete={(visit) => {
          setSelectedVisit(visit);
          setModalMode('complete');
        }}
      />

      <VisitFormModal
        isOpen={modalMode !== null}
        cats={cats}
        clinics={clinics}
        doctors={doctors}
        visits={visits}
        initialVisit={selectedVisit}
        isSubmitting={isSubmitting}
        isCompleting={modalMode === 'complete'}
        onSubmit={handleSubmit}
        onComplete={handleComplete}
        onCancelVisit={handleCancel}
        onDelete={selectedVisit ? handleDelete : undefined}
        onClose={closeModal}
      />
    </section>
  );
}

export default VisitsSection;
