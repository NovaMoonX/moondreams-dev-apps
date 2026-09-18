import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import { deleteHealthRecord } from '../store/actions/healthRecordsActions';
import {
  selectCatsByHousehold,
  selectCustomHealthRecordTypesByHousehold,
  selectHealthRecordsByHousehold,
  selectIngestionDraftCountByHousehold,
} from '../store/selectors';
import type { HealthRecord } from '../types';
import CountBadge from './CountBadge';
import DetailsDisclosure from './DetailsDisclosure';
import HealthRecordTimeline from './HealthRecordTimeline';
import HealthRecordUploadModal from './HealthRecordUploadModal';
import DocumentIngestionModal from './DocumentIngestionModal';

interface HealthRecordsSectionProps {
  householdId: string;
}

function HealthRecordsSection({ householdId }: HealthRecordsSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const records = useAppSelector(selectHealthRecordsByHousehold(householdId), shallowEqual);
  const customTypes = useAppSelector(
    selectCustomHealthRecordTypesByHousehold(householdId),
    shallowEqual,
  );
  const pendingDraftCount = useAppSelector(selectIngestionDraftCountByHousehold(householdId));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | null>(null);
  const [isIngestionOpen, setIsIngestionOpen] = useState(false);

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
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='gap-1'
                onClick={() => setIsIngestionOpen(true)}
                disabled={!user?.uid}
              >
                Upload
                {pendingDraftCount > 0 && <CountBadge count={pendingDraftCount} />}
              </Button>
              <Button
                type='button'
                variant='primary'
                size='sm'
                onClick={openCreate}
                disabled={!user?.uid || cats.length === 0}
              >
                <span className='hidden sm:inline'>Add record</span>
                <span className='sm:hidden'>Add</span>
              </Button>
            </div>
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
      {user?.uid && (
        <DocumentIngestionModal
          isOpen={isIngestionOpen}
          householdId={householdId}
          uid={user.uid}
          intent='record'
          onClose={() => setIsIngestionOpen(false)}
        />
      )}
    </section>
  );
}

export default HealthRecordsSection;
