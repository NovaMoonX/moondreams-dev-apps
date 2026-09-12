import { Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import CatProfileForm from './CatProfileForm';
import type { Cat } from '../types';

interface CatDetailsModalProps {
  isOpen: boolean;
  cat: Cat | null;
  householdId?: string;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onDelete?: (cat: Cat) => Promise<void> | void;
  onClose: () => void;
}

function CatDetailsModal({
  isOpen,
  cat,
  householdId,
  isSubmitting,
  onSubmit,
  onDelete,
  onClose,
}: CatDetailsModalProps) {
  const { confirm } = useActionModal();

  const handleDelete = async () => {
    if (!cat || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete cat',
      message: `Are you sure you want to delete ${cat.name}? This action cannot be undone.`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(cat);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cat ? `${cat.name}'s details` : 'Cat details'}>
      <CatProfileForm
        key={cat?.id}
        cat={cat}
        householdId={householdId}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onCancel={onClose}
        onDelete={handleDelete}
      />
    </Modal>
  );
}

export default CatDetailsModal;
