import { useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { createCatCondition } from '../store/actions/catConditionsActions';
import { selectConditionLibrary } from '../store/selectors';
import type { Cat, CatCondition } from '../types';
import CatConditionFormModal from './CatConditionFormModal';

interface QuickAddConditionModalProps {
  isOpen: boolean;
  householdId: string;
  cats: Cat[];
  onClose: () => void;
}

function QuickAddConditionModal({ isOpen, householdId, cats, onClose }: QuickAddConditionModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const libraryConditions = useAppSelector(selectConditionLibrary);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const handleSubmit = async (
    condition: Partial<CatCondition> & Pick<CatCondition, 'name' | 'category' | 'status' | 'occurredAt'>,
  ) => {
    if (!user?.uid || !condition.catId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createCatCondition({ householdId, catId: condition.catId, uid: user.uid, condition }),
      ).unwrap();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CatConditionFormModal
      isOpen={isOpen}
      libraryConditions={libraryConditions}
      catOptions={catOptions}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default QuickAddConditionModal;
