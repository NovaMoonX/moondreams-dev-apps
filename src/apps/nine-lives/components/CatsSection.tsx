import { useState } from 'react';

import { Button, DropdownMenu, DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown } from '@moondreamsdev/dreamer-ui/symbols';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import AddCatModal from './AddCatModal';
import CatAvatarItem from './CatAvatarItem';
import CatDetailsModal from './CatDetailsModal';
import CatDetailsPrompt from './CatDetailsPrompt';
import type { CatQuickAddValues } from './CatQuickAddForm';
import QuickAddConditionModal from './QuickAddConditionModal';
import QuickAddPreventiveModal from './QuickAddPreventiveModal';
import QuickAddSymptomModal from './QuickAddSymptomModal';
import QuickAddVaccinationModal from './QuickAddVaccinationModal';
import QuickAddWeightEntryModal from './QuickAddWeightEntryModal';
import SelectedCatPanel from './SelectedCatPanel';
import { createCat, deleteCat, updateCat } from '../store/actions/catsActions';
import { selectCatsByHousehold } from '../store/selectors';
import type { Cat } from '../types';

interface CatsSectionProps {
  householdId: string;
}

function CatsSection({ householdId }: CatsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [showQuickAddVaccination, setShowQuickAddVaccination] = useState(false);
  const [showQuickAddPreventive, setShowQuickAddPreventive] = useState(false);
  const [showQuickAddWeightEntry, setShowQuickAddWeightEntry] = useState(false);
  const [showQuickAddCondition, setShowQuickAddCondition] = useState(false);
  const [showQuickAddSymptom, setShowQuickAddSymptom] = useState(false);
  const [pendingDetailsCat, setPendingDetailsCat] = useState<Cat | null>(null);
  const [editingCat, setEditingCat] = useState<Cat | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const selectedCat = selectedCatId ? cats.find((cat) => cat.id === selectedCatId) ?? null : null;

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
  const { option } = DropdownMenuFactories;
  const logMenuItems = [
    option({
      label: 'Log vaccination',
      value: 'log-vaccination',
      description: 'Add a vaccination record for a cat.',
    }),
    option({
      label: 'Log preventive / med',
      value: 'log-preventive',
      description: 'Add a preventive or medication dose for one or more cats.',
    }),
    option({
      label: 'Log weight',
      value: 'log-weight',
      description: 'Add a weight entry for a cat.',
    }),
    option({
      label: 'Log condition',
      value: 'log-condition',
      description: 'Add a condition for a cat.',
    }),
    option({
      label: 'Log symptom',
      value: 'log-symptom',
      description: 'Add a symptom for a cat.',
    }),
  ];

  return (
    <section className='rounded-lg border border-border bg-card p-4'>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <h2 className='text-xl font-semibold'>Cats</h2>
        <div className='flex items-center gap-2'>
          <DropdownMenu
            items={logMenuItems}
            onItemSelect={(value) => {
              if (value === 'log-vaccination') {
                setShowQuickAddVaccination(true);
              } else if (value === 'log-preventive') {
                setShowQuickAddPreventive(true);
              } else if (value === 'log-weight') {
                setShowQuickAddWeightEntry(true);
              } else if (value === 'log-condition') {
                setShowQuickAddCondition(true);
              } else if (value === 'log-symptom') {
                setShowQuickAddSymptom(true);
              }
            }}
            placement='bottom'
            alignment='end'
            offset={8}
            trigger={
              <Button type='button' variant='secondary' disabled={cats.length === 0} className='gap-1'>
                Log
                <ChevronDown className='h-4 w-4' />
              </Button>
            }
          />
          <Button type='button' onClick={() => setShowAddCatModal(true)}>
            <span className='hidden sm:inline'>Add cat</span>
            <span className='sm:hidden'>Add</span>
          </Button>
        </div>
      </div>

      {cats.length === 0 && <p className='text-sm text-muted-foreground'>No cats added yet.</p>}

      {cats.length > 0 && (
        <div className='grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
          {cats.map((cat) => (
            <CatAvatarItem
              key={cat.id}
              cat={cat}
              selected={cat.id === selectedCatId}
              onClick={(clickedCat) =>
                setSelectedCatId((current) => (current === clickedCat.id ? null : clickedCat.id))
              }
            />
          ))}
        </div>
      )}

      {selectedCat && (
        <SelectedCatPanel
          key={selectedCat.id}
          householdId={householdId}
          cats={cats}
          selectedCat={selectedCat}
          onEditDetails={() => setEditingCat(selectedCat)}
        />
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

      <QuickAddPreventiveModal
        isOpen={showQuickAddPreventive}
        householdId={householdId}
        cats={cats}
        onClose={() => setShowQuickAddPreventive(false)}
      />

      <QuickAddWeightEntryModal
        isOpen={showQuickAddWeightEntry}
        householdId={householdId}
        cats={cats}
        onClose={() => setShowQuickAddWeightEntry(false)}
      />

      <QuickAddConditionModal
        isOpen={showQuickAddCondition}
        householdId={householdId}
        cats={cats}
        onClose={() => setShowQuickAddCondition(false)}
      />

      <QuickAddSymptomModal
        isOpen={showQuickAddSymptom}
        householdId={householdId}
        cats={cats}
        onClose={() => setShowQuickAddSymptom(false)}
      />
    </section>
  );
}

export default CatsSection;
