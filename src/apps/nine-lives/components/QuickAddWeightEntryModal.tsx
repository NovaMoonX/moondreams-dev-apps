import { useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';

import { createWeightEntry } from '../store/actions/weightEntriesActions';
import type { Cat, WeightEntry } from '../types';
import WeightEntryFormModal from './WeightEntryFormModal';

interface QuickAddWeightEntryModalProps {
  isOpen: boolean;
  householdId: string;
  cats: Cat[];
  onClose: () => void;
}

function QuickAddWeightEntryModal({ isOpen, householdId, cats, onClose }: QuickAddWeightEntryModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const handleSubmit = async (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => {
    if (!user?.uid || !weightEntry.catId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createWeightEntry({ householdId, catId: weightEntry.catId, uid: user.uid, weightEntry }),
      ).unwrap();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WeightEntryFormModal
      isOpen={isOpen}
      catOptions={catOptions}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default QuickAddWeightEntryModal;
