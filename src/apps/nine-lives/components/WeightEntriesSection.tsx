import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createWeightEntry,
  deleteWeightEntry,
  updateWeightEntry,
} from '../store/actions/weightEntriesActions';
import { selectWeightEntriesByCat } from '../store/selectors';
import type { WeightEntry } from '../types';
import DetailsDisclosure from './DetailsDisclosure';
import WeightEntryFormModal from './WeightEntryFormModal';
import WeightHistoryList from './WeightHistoryList';

interface WeightEntriesSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function WeightEntriesSection({ householdId, catId, catName }: WeightEntriesSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const weightEntries = useAppSelector(selectWeightEntriesByCat(catId));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);

  const handleSubmit = async (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingEntry) {
        await dispatch(
          updateWeightEntry({
            householdId,
            catId,
            weightEntryId: editingEntry.id,
            changes: weightEntry,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createWeightEntry({ householdId, catId, uid: user.uid, weightEntry }),
        ).unwrap();
      }

      setShowAddForm(false);
      setEditingEntry(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (weightEntryId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteWeightEntry({ householdId, catId, weightEntryId })).unwrap();
      setShowAddForm(false);
      setEditingEntry(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <DetailsDisclosure label='Weight history'>
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2 pb-2'>
            <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s weight over time.</small>
            <Button type='button' variant='primary' size='sm' onClick={() => setShowAddForm(true)}>
              Add weight entry
            </Button>
          </div>

          <WeightHistoryList entries={weightEntries} onEdit={setEditingEntry} />
        </div>
      </DetailsDisclosure>

      <WeightEntryFormModal
        isOpen={showAddForm || Boolean(editingEntry)}
        catName={catName}
        initialWeightEntry={editingEntry}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingEntry ? handleDelete : undefined}
        onClose={() => {
          setShowAddForm(false);
          setEditingEntry(null);
        }}
      />
    </section>
  );
}

export default WeightEntriesSection;
