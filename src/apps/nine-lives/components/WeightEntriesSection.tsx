import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createWeightEntry,
  deleteWeightEntry,
  updateWeightEntry,
} from '../store/actions/weightEntriesActions';
import { selectWeightEntriesByCat } from '../store/selectors';
import type { WeightEntry } from '../types';
import WeightEntryFormFields from './WeightEntryFormFields';
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

  const handleCreate = async (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createWeightEntry({ householdId, catId, uid: user.uid, weightEntry })).unwrap();
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (
    weightEntry: Partial<WeightEntry> & Pick<WeightEntry, 'weight' | 'unit' | 'measuredAt'>,
  ) => {
    if (!editingEntry) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateWeightEntry({ householdId, catId, weightEntryId: editingEntry.id, changes: weightEntry }),
      ).unwrap();
      setEditingEntry(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (weightEntryId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteWeightEntry({ householdId, catId, weightEntryId })).unwrap();
      setEditingEntry(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (editingEntry) {
    return (
      <div className='space-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          onClick={() => setEditingEntry(null)}
          disabled={isSubmitting}
          className='gap-1 px-0'
        >
          <ChevronLeft className='h-4 w-4' />
          Back to weight history
        </Button>

        <WeightEntryFormFields
          catName={catName}
          initialWeightEntry={editingEntry}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdate}
          onDelete={handleDelete}
          onCancel={() => setEditingEntry(null)}
        />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s weight over time.</small>
        <Button type='button' variant='primary' size='sm' onClick={() => setShowAddForm(true)}>
          Add weight entry
        </Button>
      </div>

      <WeightHistoryList entries={weightEntries} onEdit={setEditingEntry} />

      <WeightEntryFormModal
        isOpen={showAddForm}
        catName={catName}
        isSubmitting={isSubmitting}
        onSubmit={handleCreate}
        onClose={() => setShowAddForm(false)}
      />
    </div>
  );
}

export default WeightEntriesSection;
