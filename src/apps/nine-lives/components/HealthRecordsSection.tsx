import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { deleteHealthRecord } from '../store/actions/healthRecordsActions';
import {
  selectCatsByHousehold,
  selectCustomHealthRecordTypesByHousehold,
  selectHealthRecordsByHousehold,
} from '../store/selectors';
import type { HealthRecord } from '../types';
import DetailsDisclosure from './DetailsDisclosure';
import HealthRecordTimeline from './HealthRecordTimeline';
import HealthRecordUploadModal from './HealthRecordUploadModal';

interface HealthRecordsSectionProps {
  householdId: string;
}

function HealthRecordsSection({ householdId }: HealthRecordsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const cats = useAppSelector(selectCatsByHousehold(householdId));
  const records = useAppSelector(selectHealthRecordsByHousehold(householdId));
  const customTypes = useAppSelector(
    selectCustomHealthRecordTypesByHousehold(householdId),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | null>(null);

  const catOptions = useMemo(
    () => cats.map((cat) => ({ label: cat.name, value: cat.id })),
    [cats],
  );

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
    await dispatch(deleteHealthRecord({ householdId, recordId })).unwrap();
    handleClose();
  };

  return (
    <section>
      <DetailsDisclosure label='Records'>
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2 pb-2'>
            <small className='text-muted-foreground text-sm'>
              Upload and manage lab results and vet paperwork for any cat.
            </small>
            <Button
              type='button'
              variant='primary'
              size='sm'
              onClick={openCreate}
              disabled={!user?.uid || cats.length === 0}
            >
              Add record
            </Button>
          </div>

          <HealthRecordTimeline
            records={records}
            cats={cats}
            customTypes={customTypes}
            onEdit={openEdit}
          />
        </div>
      </DetailsDisclosure>

      {user?.uid && (
        <HealthRecordUploadModal
          key={editingRecord?.id ?? 'new'}
          isOpen={isModalOpen}
          householdId={householdId}
          catOptions={catOptions}
          uid={user.uid}
          initialRecord={editingRecord}
          onDelete={handleDelete}
          onClose={handleClose}
        />
      )}
    </section>
  );
}

export default HealthRecordsSection;
