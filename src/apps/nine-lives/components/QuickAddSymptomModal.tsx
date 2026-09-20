import { useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';

import { createSymptom } from '../store/actions/symptomsActions';
import type { Cat, Symptom } from '../types';
import SymptomFormModal from './SymptomFormModal';

interface QuickAddSymptomModalProps {
  isOpen: boolean;
  householdId: string;
  cats: Cat[];
  onClose: () => void;
}

function QuickAddSymptomModal({ isOpen, householdId, cats, onClose }: QuickAddSymptomModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const handleSubmit = async (symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>) => {
    if (!user?.uid || !symptom.catId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createSymptom({ householdId, catId: symptom.catId, uid: user.uid, symptom })).unwrap();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SymptomFormModal
      isOpen={isOpen}
      householdId={householdId}
      catOptions={catOptions}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default QuickAddSymptomModal;
