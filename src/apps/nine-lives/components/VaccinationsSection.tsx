import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createVaccination,
  deleteVaccination,
  updateVaccination,
} from '../store/actions/vaccinationsActions';
import { selectVaccinationsByCat } from '../store/selectors';
import type { Vaccination } from '../types';
import VaccinationFormFields from './VaccinationFormFields';
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

  const handleCreate = async (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createVaccination({ householdId, catId, uid: user.uid, vaccination })).unwrap();
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => {
    if (!editingVaccination) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateVaccination({ householdId, catId, vaccinationId: editingVaccination.id, changes: vaccination }),
      ).unwrap();
      setEditingVaccination(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (vaccinationId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteVaccination({ householdId, catId, vaccinationId })).unwrap();
      setEditingVaccination(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (editingVaccination) {
    return (
      <div className='space-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          onClick={() => setEditingVaccination(null)}
          disabled={isSubmitting}
          className='gap-1 px-0'
        >
          <ChevronLeft className='h-4 w-4' />
          Back to vaccinations
        </Button>

        <VaccinationFormFields
          householdId={householdId}
          initialVaccination={editingVaccination}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdate}
          onDelete={handleDelete}
          onCancel={() => setEditingVaccination(null)}
        />
      </div>
    );
  }

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
        isOpen={showAddForm}
        householdId={householdId}
        catName={catName}
        isSubmitting={isSubmitting}
        onSubmit={handleCreate}
        onClose={() => setShowAddForm(false)}
      />
    </div>
  );
}

export default VaccinationsSection;
