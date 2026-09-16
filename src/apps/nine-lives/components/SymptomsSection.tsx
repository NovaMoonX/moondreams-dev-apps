import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { createSymptom, deleteSymptom, updateSymptom } from '../store/actions/symptomsActions';
import { selectConditionsByCat, selectSymptomsByCat } from '../store/selectors';
import type { Symptom } from '../types';
import SymptomFormModal from './SymptomFormModal';
import SymptomTimeline from './SymptomTimeline';

interface SymptomsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function SymptomsSection({ householdId, catId, catName }: SymptomsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const symptoms = useAppSelector(selectSymptomsByCat(catId), shallowEqual);
  const conditions = useAppSelector(selectConditionsByCat(catId), shallowEqual);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSymptom, setEditingSymptom] = useState<Symptom | null>(null);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSymptom(null);
  };

  const handleSubmit = async (symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingSymptom) {
        await dispatch(
          updateSymptom({ householdId, symptomId: editingSymptom.id, changes: symptom }),
        ).unwrap();
      } else {
        await dispatch(createSymptom({ householdId, catId, uid: user.uid, symptom })).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (symptomId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteSymptom({ householdId, symptomId })).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s symptoms here.</small>
        <Button
          type='button'
          variant='primary'
          size='sm'
          onClick={() => {
            setEditingSymptom(null);
            setIsModalOpen(true);
          }}
        >
          <span className='hidden sm:inline'>Add symptom</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>

      <SymptomTimeline
        symptoms={symptoms}
        conditions={conditions}
        onEdit={(symptom) => {
          setEditingSymptom(symptom);
          setIsModalOpen(true);
        }}
      />

      <SymptomFormModal
        key={editingSymptom?.id ?? 'new'}
        isOpen={isModalOpen}
        catName={catName}
        conditions={conditions}
        initialSymptom={editingSymptom}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingSymptom ? handleDelete : undefined}
        onClose={closeModal}
      />
    </div>
  );
}

export default SymptomsSection;
