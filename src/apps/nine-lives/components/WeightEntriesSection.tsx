import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createWeightEntry,
  deleteWeightEntry,
  updateWeightEntry,
} from '../store/actions/weightEntriesActions';
import { selectWeightEntriesByCat } from '../store/selectors';
import type { WeightEntry } from '../types';
import { convertWeight } from '../utils/litterCalculators';
import TrendLineChart from './TrendLineChart';
import ViewToggle, { type ViewToggleValue } from './ViewToggle';
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
  const weightEntries = useAppSelector(selectWeightEntriesByCat(catId), shallowEqual);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);
  const [activeView, setActiveView] = useState<ViewToggleValue>('list');

  const chartUnit = weightEntries[0]?.unit ?? 'lb';
  const chartData = useMemo(
    () =>
      weightEntries.map((entry) => ({
        x: entry.measuredAt,
        y: convertWeight(entry.weight, entry.unit, chartUnit),
      })),
    [weightEntries, chartUnit],
  );

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

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
          updateWeightEntry({ householdId, weightEntryId: editingEntry.id, changes: weightEntry }),
        ).unwrap();
      } else {
        await dispatch(
          createWeightEntry({ householdId, catId, uid: user.uid, weightEntry }),
        ).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (weightEntryId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteWeightEntry({ householdId, weightEntryId })).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>Track {catName}&rsquo;s weight over time.</small>
        <Button
          type='button'
          variant='primary'
          size='sm'
          onClick={() => {
            setEditingEntry(null);
            setIsModalOpen(true);
          }}
        >
          <span className='hidden sm:inline'>Add weight entry</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>

      <div className='flex justify-end'>
        <ViewToggle value={activeView} onChange={setActiveView} />
      </div>

      {activeView === 'list' ? (
        <WeightHistoryList
          entries={weightEntries}
          onEdit={(entry) => {
            setEditingEntry(entry);
            setIsModalOpen(true);
          }}
        />
      ) : (
        <TrendLineChart
          data={chartData}
          yLabel={`Weight (${chartUnit})`}
          formatY={(value) => `${value.toFixed(1)} ${chartUnit}`}
          emptyLabel='Log at least two weight entries to see a trend chart.'
        />
      )}

      <WeightEntryFormModal
        key={editingEntry?.id ?? 'new'}
        isOpen={isModalOpen}
        householdId={householdId}
        catName={catName}
        initialWeightEntry={editingEntry}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingEntry ? handleDelete : undefined}
        onClose={closeModal}
      />
    </div>
  );
}

export default WeightEntriesSection;
