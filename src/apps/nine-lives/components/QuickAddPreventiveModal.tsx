import { useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';

import { createPreventive } from '../store/actions/preventivesActions';
import type { Cat, Preventive } from '../types';
import PreventiveFormModal from './PreventiveFormModal';

interface QuickAddPreventiveModalProps {
  isOpen: boolean;
  householdId: string;
  cats: Cat[];
  onClose: () => void;
}

function QuickAddPreventiveModal({ isOpen, householdId, cats, onClose }: QuickAddPreventiveModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const handleSubmit = async (
    preventive: Partial<Preventive> &
      Pick<Preventive, 'name' | 'customProductId' | 'type' | 'customTypeId' | 'administeredAt' | 'catIds'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createPreventive({ householdId, uid: user.uid, preventive })).unwrap();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.uid) {
    return null;
  }

  return (
    <PreventiveFormModal
      isOpen={isOpen}
      householdId={householdId}
      uid={user.uid}
      catOptions={catOptions}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}

export default QuickAddPreventiveModal;
