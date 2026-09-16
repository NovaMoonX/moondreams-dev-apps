import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createVaccination,
  deleteVaccination,
  updateVaccination,
} from '../store/actions/vaccinationsActions';
import { selectVaccinationsByCat } from '../store/selectors';
import type { Vaccination } from '../types';
import VaccinationFormModal from './VaccinationFormModal';
import VaccinationTimeline from './VaccinationTimeline';

interface VaccinationsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function VaccinationsSection({ householdId, catId, catName }: VaccinationsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const vaccinations = useAppSelector(selectVaccinationsByCat(catId), shallowEqual);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVaccination, setEditingVaccination] = useState<Vaccination | null>(null);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingVaccination(null);
  };

  const handleSubmit = async (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingVaccination) {
        await dispatch(
          updateVaccination({ householdId, vaccinationId: editingVaccination.id, changes: vaccination }),
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
            setIsModalOpen(true);
          }}
        >
          <span className='hidden sm:inline'>Add vaccination</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>

      <VaccinationTimeline
        vaccinations={vaccinations}
        onEdit={(vaccination) => {
          setEditingVaccination(vaccination);
          setIsModalOpen(true);
        }}
      />

      <VaccinationFormModal
        key={editingVaccination?.id ?? 'new'}
        isOpen={isModalOpen}
        householdId={householdId}
        catName={catName}
        initialVaccination={editingVaccination}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingVaccination ? handleDelete : undefined}
        onClose={closeModal}
      />
    </div>
  );
}

export default VaccinationsSection;
