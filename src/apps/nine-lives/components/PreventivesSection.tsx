import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createPreventive,
  deletePreventive,
  updatePreventive,
} from '../store/actions/preventivesActions';
import {
  selectCustomPreventiveTypesByHousehold,
  selectPreventivesByCat,
} from '../store/selectors';
import type { Cat, Preventive } from '../types';
import PreventiveFormModal from './PreventiveFormModal';
import PreventiveTimeline from './PreventiveTimeline';

interface PreventivesSectionProps {
  householdId: string;
  catId: string;
  catName: string;
  cats: Cat[];
}

function PreventivesSection({ householdId, catId, catName, cats }: PreventivesSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const preventives = useAppSelector(selectPreventivesByCat(catId));
  const customTypes = useAppSelector(selectCustomPreventiveTypesByHousehold(householdId));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPreventive, setEditingPreventive] = useState<Preventive | null>(null);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const handleSubmit = async (
    preventive: Partial<Preventive> &
      Pick<Preventive, 'name' | 'customProductId' | 'type' | 'customTypeId' | 'administeredAt' | 'catIds'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingPreventive) {
        await dispatch(
          updatePreventive({
            householdId,
            preventiveId: editingPreventive.id,
            changes: preventive,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createPreventive({ householdId, uid: user.uid, preventive }),
        ).unwrap();
      }
      setIsModalOpen(false);
      setEditingPreventive(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (preventiveId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deletePreventive({ householdId, preventiveId })).unwrap();
      setIsModalOpen(false);
      setEditingPreventive(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreate = () => {
    setEditingPreventive(null);
    setIsModalOpen(true);
  };

  const openEdit = (preventive: Preventive) => {
    setEditingPreventive(preventive);
    setIsModalOpen(true);
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>
          Track {catName}&rsquo;s preventives and medications here.
        </small>
        <Button type='button' variant='primary' size='sm' onClick={openCreate}>
          <span className='hidden sm:inline'>Add preventive / med</span>
          <span className='sm:hidden'>Add</span>
        </Button>
      </div>
      <PreventiveTimeline
        preventives={preventives}
        customTypes={customTypes}
        cats={cats}
        catId={catId}
        onEdit={openEdit}
      />
      {user?.uid && (
        <PreventiveFormModal
          key={editingPreventive?.id ?? 'new'}
          isOpen={isModalOpen}
          householdId={householdId}
          uid={user.uid}
          catOptions={catOptions}
          defaultCatIds={[catId]}
          initialPreventive={editingPreventive}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onClose={() => {
            setIsModalOpen(false);
            setEditingPreventive(null);
          }}
        />
      )}
    </div>
  );
}

export default PreventivesSection;
