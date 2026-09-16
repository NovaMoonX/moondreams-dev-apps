import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { createExpense } from '../store/actions/expensesActions';
import {
  cancelVisit,
  completeVisit,
  createVisit,
  deleteVisit,
  reopenVisit,
  updateVisit,
  type VisitOutcome,
} from '../store/actions/visitsActions';
import {
  selectCatsByHousehold,
  selectClinicsByHousehold,
  selectDoctorsByHousehold,
  selectVisitsByHousehold,
} from '../store/selectors';
import type { Expense, Visit } from '../types';
import ExpenseFormModal from './ExpenseFormModal';
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
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const clinics = useAppSelector(selectClinicsByHousehold(householdId), shallowEqual);
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId), shallowEqual);
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const [modalMode, setModalMode] = useState<VisitModalMode>(null);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedVisitForExpense, setCompletedVisitForExpense] = useState<Visit | null>(null);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

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
      const completedVisit = await dispatch(
        completeVisit({
          householdId,
          uid: user.uid,
          visitId: selectedVisit.id,
          outcome,
        }),
      ).unwrap();
      closeModal();
      setCompletedVisitForExpense(completedVisit);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExpenseForVisit = async (
    expense: Partial<Expense> & Pick<Expense, 'catIds' | 'items' | 'isRecurring' | 'incurredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmittingExpense(true);
    try {
      await dispatch(createExpense({ householdId, uid: user.uid, expense })).unwrap();
      setCompletedVisitForExpense(null);
    } finally {
      setIsSubmittingExpense(false);
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

  const handleReopen = async () => {
    if (!selectedVisit) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        reopenVisit({ householdId, visitId: selectedVisit.id }),
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
          <span className='hidden sm:inline'>Log visit</span>
          <span className='sm:hidden'>Log</span>
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
        onReopen={(visit) => {
          void dispatch(reopenVisit({ householdId, visitId: visit.id }));
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
        onReopenVisit={handleReopen}
        onDelete={selectedVisit ? handleDelete : undefined}
        onClose={closeModal}
      />

      {completedVisitForExpense && (
        <ExpenseFormModal
          isOpen
          householdId={householdId}
          catOptions={catOptions}
          initialExpense={{
            catIds: completedVisitForExpense.catIds,
            incurredAt: completedVisitForExpense.completedAt ?? completedVisitForExpense.scheduledAt,
            visitId: completedVisitForExpense.id,
          }}
          isSubmitting={isSubmittingExpense}
          onSubmit={handleAddExpenseForVisit}
          onClose={() => setCompletedVisitForExpense(null)}
        />
      )}
    </section>
  );
}

export default VisitsSection;
