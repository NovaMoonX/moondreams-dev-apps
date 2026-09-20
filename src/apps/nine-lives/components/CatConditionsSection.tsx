import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createCatCondition,
  deleteCatCondition,
  updateCatCondition,
} from '../store/actions/catConditionsActions';
import { selectConditionLibrary, selectConditionsByCat } from '../store/selectors';
import type { CatCondition } from '../types';
import CatConditionFormModal from './CatConditionFormModal';
import CatConditionTimeline from './CatConditionTimeline';

interface CatConditionsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function CatConditionsSection({ householdId, catId, catName }: CatConditionsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const conditions = useAppSelector(selectConditionsByCat(catId), shallowEqual);
  const libraryConditions = useAppSelector(selectConditionLibrary);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<CatCondition | null>(null);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCondition(null);
  };

  const handleSubmit = async (
    condition: Partial<CatCondition> & Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingCondition) {
        await dispatch(
          updateCatCondition({ householdId, catConditionId: editingCondition.id, changes: condition }),
        ).unwrap();
      } else {
        await dispatch(
          createCatCondition({ householdId, catId, uid: user.uid, condition }),
        ).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (catConditionId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteCatCondition({ householdId, catConditionId })).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s conditions here.</small>
        <Button
          type='button'
          variant='primary'
          size='sm'
          onClick={() => {
            setEditingCondition(null);
            setIsModalOpen(true);
          }}
        >
          <span className='hidden sm:inline'>Add condition</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>

      <CatConditionTimeline
        conditions={conditions}
        onEdit={(condition) => {
          setEditingCondition(condition);
          setIsModalOpen(true);
        }}
      />

      <CatConditionFormModal
        key={editingCondition?.id ?? 'new'}
        isOpen={isModalOpen}
        householdId={householdId}
        libraryConditions={libraryConditions}
        initialCondition={editingCondition}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingCondition ? handleDelete : undefined}
        onClose={closeModal}
      />
    </div>
  );
}

export default CatConditionsSection;
