import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { createSymptom, deleteSymptom, updateSymptom } from '../store/actions/symptomsActions';
import { selectConditionsByCat, selectSymptomsByCat } from '../store/selectors';
import type { Symptom } from '../types';
import SymptomFormFields from './SymptomFormFields';
import SymptomTimeline from './SymptomTimeline';

interface SymptomsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function SymptomsSection({ householdId, catId, catName }: SymptomsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const symptoms = useAppSelector(selectSymptomsByCat(catId));
  const conditions = useAppSelector(selectConditionsByCat(catId));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSymptom, setEditingSymptom] = useState<Symptom | null>(null);

  const handleCreate = async (symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createSymptom({ householdId, catId, uid: user.uid, symptom })).unwrap();
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>) => {
    if (!editingSymptom) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateSymptom({ householdId, catId, symptomId: editingSymptom.id, changes: symptom }),
      ).unwrap();
      setEditingSymptom(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (symptomId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteSymptom({ householdId, catId, symptomId })).unwrap();
      setEditingSymptom(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (editingSymptom) {
    return (
      <div className='space-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          onClick={() => setEditingSymptom(null)}
          disabled={isSubmitting}
          className='gap-1 px-0'
        >
          <ChevronLeft className='h-4 w-4' />
          Back to symptoms
        </Button>

        <SymptomFormFields
          conditions={conditions}
          initialSymptom={editingSymptom}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdate}
          onDelete={handleDelete}
          onCancel={() => setEditingSymptom(null)}
        />
      </div>
    );
  }

  if (showAddForm) {
    return (
      <div className='space-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          onClick={() => setShowAddForm(false)}
          disabled={isSubmitting}
          className='gap-1 px-0'
        >
          <ChevronLeft className='h-4 w-4' />
          Back to symptoms
        </Button>

        <SymptomFormFields
          conditions={conditions}
          isSubmitting={isSubmitting}
          onSubmit={handleCreate}
          onCancel={() => setShowAddForm(false)}
        />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s symptoms here.</small>
        <Button type='button' variant='primary' size='sm' onClick={() => setShowAddForm(true)}>
          Add symptom
        </Button>
      </div>

      <SymptomTimeline symptoms={symptoms} conditions={conditions} onEdit={setEditingSymptom} />
    </div>
  );
}

export default SymptomsSection;
