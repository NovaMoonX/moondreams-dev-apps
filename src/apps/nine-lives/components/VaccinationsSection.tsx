import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

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
  const vaccinations = useAppSelector(selectVaccinationsByCat(catId));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVaccination, setEditingVaccination] = useState<Vaccination | null>(null);

  const activeVaccination = editingVaccination;

  const handleSubmit = async (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (activeVaccination) {
        await dispatch(
          updateVaccination({
            householdId,
            catId,
            vaccinationId: activeVaccination.id,
            changes: vaccination,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createVaccination({ householdId, catId, uid: user.uid, vaccination }),
        ).unwrap();
      }

      setShowAddForm(false);
      setEditingVaccination(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (vaccinationId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteVaccination({ householdId, catId, vaccinationId })).unwrap();
      setShowAddForm(false);
      setEditingVaccination(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s vaccinations here.</small>
        <Button type='button' variant='primary' size='sm' onClick={() => setShowAddForm(true)}>
          Add vaccination
        </Button>
      </div>

      <VaccinationTimeline vaccinations={vaccinations} onEdit={setEditingVaccination} />

      <VaccinationFormModal
        isOpen={showAddForm || Boolean(editingVaccination)}
        householdId={householdId}
        catName={catName}
        initialVaccination={editingVaccination}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingVaccination ? handleDelete : undefined}
        onClose={() => {
          setShowAddForm(false);
          setEditingVaccination(null);
        }}
      />
    </div>
  );
}

export default VaccinationsSection;
