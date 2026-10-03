import { useEffect, useRef, useState } from 'react';

import { Button, DropdownMenu, DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown } from '@moondreamsdev/dreamer-ui/symbols';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { useAttentionFocus } from '../context/attentionFocusContext';
import AddCatModal from './AddCatModal';
import CatAvatarItem from './CatAvatarItem';
import CatDetailsModal from './CatDetailsModal';
import CatDetailsPrompt from './CatDetailsPrompt';
import type { CatQuickAddValues } from './CatQuickAddForm';
import { CatLogModals } from './CatQuickLog';
import SelectedCatPanel from './SelectedCatPanel';
import { createCat, deleteCat, updateCat } from '../store/actions/catsActions';
import { selectCatsByHousehold } from '../store/selectors';
import { CAT_LOG_OPTIONS, type CatLogKind } from '../constants/catLog';
import type { Cat } from '../types';

interface CatsSectionProps {
  householdId: string;
}

function CatsSection({ householdId }: CatsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const { focusRequest } = useAttentionFocus();
  const sectionRef = useRef<HTMLElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [activeLog, setActiveLog] = useState<CatLogKind | null>(null);
  const [pendingDetailsCat, setPendingDetailsCat] = useState<Cat | null>(null);
  const [editingCat, setEditingCat] = useState<Cat | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [handledFocusRequestedAt, setHandledFocusRequestedAt] = useState<number | undefined>(undefined);
  const selectedCat = selectedCatId ? cats.find((cat) => cat.id === selectedCatId) ?? null : null;

  const isCatFocusRequest =
    focusRequest?.kind === 'vaccination-log-dose' || focusRequest?.kind === 'preventive-log-dose';

  if (isCatFocusRequest && focusRequest.requestedAt !== handledFocusRequestedAt) {
    setHandledFocusRequestedAt(focusRequest.requestedAt);
    setSelectedCatId(focusRequest.catId);
  }

  useEffect(() => {
    if (!isCatFocusRequest) {
      return;
    }

    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isCatFocusRequest, focusRequest]);

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
        updateCat({ householdId, catId: nextCat.id, reminderUid: user?.uid, changes: nextCat }),
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
  const logMenuItems = CAT_LOG_OPTIONS.map(({ value, label, icon: Icon }) =>
    option({ label, value, icon: <Icon className='h-4 w-4' /> }),
  );

  return (
    <section ref={sectionRef} className='rounded-lg border border-border bg-card p-4'>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <h2 className='text-xl font-semibold'>Cats</h2>
        <div className='flex items-center gap-2'>
          <DropdownMenu
            items={logMenuItems}
            onItemSelect={(value) => setActiveLog(value as CatLogKind)}
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

      <CatLogModals householdId={householdId} cats={cats} activeLog={activeLog} onClose={() => setActiveLog(null)} />
    </section>
  );
}

export default CatsSection;
