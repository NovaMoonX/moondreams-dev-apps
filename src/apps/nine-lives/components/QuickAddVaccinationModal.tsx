import { useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';

import { createVaccination } from '../store/actions/vaccinationsActions';
import type { Cat, Vaccination } from '../types';
import VaccinationFormModal from './VaccinationFormModal';

interface QuickAddVaccinationModalProps {
  isOpen: boolean;
  householdId: string;
  cats: Cat[];
  onClose: () => void;
}

function QuickAddVaccinationModal({ isOpen, householdId, cats, onClose }: QuickAddVaccinationModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const handleSubmit = async (
    vaccination: Partial<Vaccination> & Pick<Vaccination, 'name' | 'administeredAt'>,
  ) => {
    if (!user?.uid || !vaccination.catId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createVaccination({ householdId, catId: vaccination.catId, uid: user.uid, vaccination }),
      ).unwrap();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <VaccinationFormModal
      isOpen={isOpen}
      householdId={householdId}
      catOptions={catOptions}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default QuickAddVaccinationModal;
