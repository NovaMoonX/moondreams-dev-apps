import { Modal } from '@moondreamsdev/dreamer-ui/components';

import CatProfileForm from './CatProfileForm';
import type { Cat } from '../types';

interface CatDetailsModalProps {
  isOpen: boolean;
  cat: Cat | null;
  householdId?: string;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onClose: () => void;
}

function CatDetailsModal({
  isOpen,
  cat,
  householdId,
  isSubmitting,
  onSubmit,
  onClose,
}: CatDetailsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cat ? `${cat.name}'s details` : 'Cat details'}>
      <CatProfileForm
        key={cat?.id}
        cat={cat}
        householdId={householdId}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}

export default CatDetailsModal;
