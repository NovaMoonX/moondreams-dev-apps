import { Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useCatDetailSync } from '../hooks/useCatDetailSync';
import type { Cat } from '../types';
import CatProfileForm from './CatProfileForm';
import VaccinationsSection from './VaccinationsSection';
import WeightEntriesSection from './WeightEntriesSection';

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

  useCatDetailSync(householdId, cat?.id);

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
      <div className='space-y-4'>
        <CatProfileForm
          key={cat?.id}
          cat={cat}
          householdId={householdId}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          onCancel={onClose}
          onDelete={handleDelete}
        />

        {cat && householdId && (
          <>
            <VaccinationsSection householdId={householdId} catId={cat.id} catName={cat.name} />
            <WeightEntriesSection householdId={householdId} catId={cat.id} catName={cat.name} />
          </>
        )}
      </div>
    </Modal>
  );
}

export default CatDetailsModal;
