import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createCatCondition,
  deleteCatCondition,
  updateCatCondition,
} from '../store/actions/catConditionsActions';
import { selectConditionLibrary, selectConditionsByCat } from '../store/selectors';
import type { CatCondition } from '../types';
import CatConditionFormFields from './CatConditionFormFields';
import CatConditionTimeline from './CatConditionTimeline';

interface CatConditionsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function CatConditionsSection({ householdId, catId, catName }: CatConditionsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const conditions = useAppSelector(selectConditionsByCat(catId));
  const libraryConditions = useAppSelector(selectConditionLibrary);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCondition, setEditingCondition] = useState<CatCondition | null>(null);

  const handleCreate = async (
    condition: Partial<CatCondition> & Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createCatCondition({ householdId, catId, uid: user.uid, condition })).unwrap();
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (
    condition: Partial<CatCondition> & Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>,
  ) => {
    if (!editingCondition) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateCatCondition({ householdId, catId, catConditionId: editingCondition.id, changes: condition }),
      ).unwrap();
      setEditingCondition(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (catConditionId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteCatCondition({ householdId, catId, catConditionId })).unwrap();
      setEditingCondition(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (editingCondition) {
    return (
      <div className='space-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          onClick={() => setEditingCondition(null)}
          disabled={isSubmitting}
          className='gap-1 px-0'
        >
          <ChevronLeft className='h-4 w-4' />
          Back to conditions
        </Button>

        <CatConditionFormFields
          libraryConditions={libraryConditions}
          initialCondition={editingCondition}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdate}
          onDelete={handleDelete}
          onCancel={() => setEditingCondition(null)}
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
          Back to conditions
        </Button>

        <CatConditionFormFields
          libraryConditions={libraryConditions}
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
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s conditions here.</small>
        <Button type='button' variant='primary' size='sm' onClick={() => setShowAddForm(true)}>
          Add condition
        </Button>
      </div>

      <CatConditionTimeline conditions={conditions} onEdit={setEditingCondition} />
    </div>
  );
}

export default CatConditionsSection;
