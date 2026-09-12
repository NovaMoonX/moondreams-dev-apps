import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import AddCatModal from './AddCatModal';
import CatAvatarItem from './CatAvatarItem';
import CatDetailsModal from './CatDetailsModal';
import CatDetailsPrompt from './CatDetailsPrompt';
import type { CatQuickAddValues } from './CatQuickAddForm';
import { createCat, updateCat } from '../store/actions/catsActions';
import { selectCatsByHousehold } from '../store/selectors';
import type { Cat } from '../types';

interface CatsSectionProps {
  householdId: string;
}

function CatsSection({ householdId }: CatsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const cats = useAppSelector(selectCatsByHousehold(householdId));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [pendingDetailsCat, setPendingDetailsCat] = useState<Cat | null>(null);
  const [editingCat, setEditingCat] = useState<Cat | null>(null);

  const handleCreateCat = async (values: CatQuickAddValues) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const createdCat = await dispatch(
        createCat({ householdId, uid: user.uid, cat: values }),
      ).unwrap();
      setShowAddCatModal(false);
      setPendingDetailsCat(createdCat);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveCatDetails = async (nextCat: Cat) => {
    setIsSubmitting(true);

    try {
      await dispatch(
        updateCat({ householdId, catId: nextCat.id, changes: nextCat }),
      ).unwrap();
      setPendingDetailsCat(null);
      setEditingCat(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const detailsCat = editingCat ?? pendingDetailsCat;

  return (
    <section className='rounded-lg border border-border bg-card p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-semibold'>Cats</h2>
        <Button type='button' onClick={() => setShowAddCatModal(true)}>
          Add cat
        </Button>
      </div>

      {cats.length === 0 && <p className='text-sm text-muted-foreground'>No cats added yet.</p>}

      {cats.length > 0 && (
        <div className='flex flex-wrap gap-4'>
          {cats.map((cat) => (
            <CatAvatarItem key={cat.id} cat={cat} onClick={setEditingCat} />
          ))}
        </div>
      )}

      <AddCatModal
        isOpen={showAddCatModal}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateCat}
        onClose={() => setShowAddCatModal(false)}
      />

      <CatDetailsPrompt
        isOpen={Boolean(pendingDetailsCat) && !editingCat}
        catName={pendingDetailsCat?.name ?? ''}
        onAddDetails={() => setEditingCat(pendingDetailsCat)}
        onDismiss={() => setPendingDetailsCat(null)}
      />

      <CatDetailsModal
        isOpen={Boolean(detailsCat) && Boolean(editingCat)}
        cat={detailsCat}
        householdId={householdId}
        isSubmitting={isSubmitting}
        onSubmit={handleSaveCatDetails}
        onClose={() => {
          setEditingCat(null);
          setPendingDetailsCat(null);
        }}
      />
    </section>
  );
}

export default CatsSection;
