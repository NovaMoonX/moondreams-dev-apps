import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createPreventive,
  deletePreventive,
  updatePreventive,
} from '../store/actions/preventivesActions';
import { selectCustomPreventiveTypesByHousehold, selectPreventivesByCat } from '../store/selectors';
import type { Preventive } from '../types';
import PreventiveFormModal from './PreventiveFormModal';
import PreventiveTimeline from './PreventiveTimeline';

interface PreventivesSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function PreventivesSection({ householdId, catId, catName }: PreventivesSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const preventives = useAppSelector(selectPreventivesByCat(catId));
  const customTypes = useAppSelector(selectCustomPreventiveTypesByHousehold(householdId));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPreventive, setEditingPreventive] = useState<Preventive | null>(null);

  const handleSubmit = async (
    preventive: Partial<Preventive> &
      Pick<Preventive, 'name' | 'customProductId' | 'type' | 'customTypeId' | 'administeredAt'>,
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
            catId,
            preventiveId: editingPreventive.id,
            changes: preventive,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createPreventive({ householdId, catId, uid: user.uid, preventive }),
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
      await dispatch(deletePreventive({ householdId, catId, preventiveId })).unwrap();
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
          Track {catName}&rsquo;s recurring parasite preventives here.
        </small>
        <Button type='button' variant='primary' size='sm' onClick={openCreate}>
          Add preventive
        </Button>
      </div>
      <PreventiveTimeline preventives={preventives} customTypes={customTypes} onEdit={openEdit} />
      {user?.uid && (
        <PreventiveFormModal
          key={editingPreventive?.id ?? 'new'}
          isOpen={isModalOpen}
          householdId={householdId}
          uid={user.uid}
          catName={catName}
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
