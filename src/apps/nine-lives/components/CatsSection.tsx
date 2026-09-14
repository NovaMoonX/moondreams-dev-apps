import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import AddCatModal from './AddCatModal';
import CatAvatarItem from './CatAvatarItem';
import CatDetailsModal from './CatDetailsModal';
import CatDetailsPrompt from './CatDetailsPrompt';
import type { CatQuickAddValues } from './CatQuickAddForm';
import QuickAddVaccinationModal from './QuickAddVaccinationModal';
import QuickAddWeightEntryModal from './QuickAddWeightEntryModal';
import { createCat, deleteCat, updateCat } from '../store/actions/catsActions';
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
  const [showQuickAddVaccination, setShowQuickAddVaccination] = useState(false);
  const [showQuickAddWeightEntry, setShowQuickAddWeightEntry] = useState(false);
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

  const handleDeleteCat = async (cat: Cat) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteCat({ householdId, catId: cat.id })).unwrap();
      setPendingDetailsCat(null);
      setEditingCat(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const detailsCat = editingCat ?? pendingDetailsCat;

  return (
    <section className='rounded-lg border border-border bg-card p-4'>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <h2 className='text-xl font-semibold'>Cats</h2>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={cats.length === 0}
            onClick={() => setShowQuickAddVaccination(true)}
          >
            Log vaccination
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={cats.length === 0}
            onClick={() => setShowQuickAddWeightEntry(true)}
          >
            Log weight
          </Button>
          <Button type='button' onClick={() => setShowAddCatModal(true)}>
            Add cat
          </Button>
        </div>
      </div>

      {cats.length === 0 && <p className='text-sm text-muted-foreground'>No cats added yet.</p>}

      {cats.length > 0 && (
        <div className='grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
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
        onDelete={handleDeleteCat}
        onClose={() => {
          setEditingCat(null);
          setPendingDetailsCat(null);
        }}
      />

      <QuickAddVaccinationModal
        isOpen={showQuickAddVaccination}
        householdId={householdId}
        cats={cats}
        onClose={() => setShowQuickAddVaccination(false)}
      />

      <QuickAddWeightEntryModal
        isOpen={showQuickAddWeightEntry}
        householdId={householdId}
        cats={cats}
        onClose={() => setShowQuickAddWeightEntry(false)}
      />
    </section>
  );
}

export default CatsSection;
