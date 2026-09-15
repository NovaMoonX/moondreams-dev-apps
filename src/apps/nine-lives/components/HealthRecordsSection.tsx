import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  deleteHealthRecord,
} from '../store/actions/healthRecordsActions';
import {
  selectCustomHealthRecordTypesByHousehold,
  selectHealthRecordsByCat,
} from '../store/selectors';
import type { HealthRecord } from '../types';
import HealthRecordList from './HealthRecordList';
import HealthRecordUploadModal from './HealthRecordUploadModal';

interface HealthRecordsSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function HealthRecordsSection({
  householdId,
  catId,
  catName,
}: HealthRecordsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const records = useAppSelector(selectHealthRecordsByCat(catId));
  const customTypes = useAppSelector(
    selectCustomHealthRecordTypesByHousehold(householdId),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | null>(null);

  const openCreate = () => {
    setEditingRecord(null);
    setIsModalOpen(true);
  };

  const openEdit = (record: HealthRecord) => {
    setEditingRecord(record);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
  };

  const handleDelete = async (recordId: string) => {
    await dispatch(
      deleteHealthRecord({ householdId, catId, recordId }),
    ).unwrap();
    handleClose();
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-muted-foreground text-sm'>
          Upload and manage {catName}&rsquo;s lab results and vet paperwork.
        </small>
        <Button
          type='button'
          variant='primary'
          size='sm'
          onClick={openCreate}
          disabled={!user?.uid}
        >
          Add record
        </Button>
      </div>

      <HealthRecordList
        records={records}
        customTypes={customTypes}
        onEdit={openEdit}
      />

      {user?.uid && (
        <HealthRecordUploadModal
          key={editingRecord?.id ?? 'new'}
          isOpen={isModalOpen}
          householdId={householdId}
          catId={catId}
          catName={catName}
          uid={user.uid}
          initialRecord={editingRecord}
          onDelete={handleDelete}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

export default HealthRecordsSection;
