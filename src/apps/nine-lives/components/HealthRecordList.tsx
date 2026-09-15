import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateTime } from '@/utils/formatUtils';

import type {
  CustomHealthRecordType,
  HealthRecord,
} from '../types';

interface HealthRecordListProps {
  records: HealthRecord[];
  customTypes: CustomHealthRecordType[];
  onEdit: (record: HealthRecord) => void;
}

const BUILT_IN_LABELS: Record<string, string> = {
  lab_result: 'Lab result',
  vet_paperwork: 'Vet paperwork',
  other: 'Other',
};

function HealthRecordList({
  records,
  customTypes,
  onEdit,
}: HealthRecordListProps) {
  const sortedRecords = [...records].sort(
    (left, right) => right.createdAt - left.createdAt,
  );

  if (sortedRecords.length === 0) {
    return <p className='text-muted-foreground text-sm'>No health records yet.</p>;
  }

  return (
    <div className='divide-border divide-y'>
      {sortedRecords.map((record) => {
        const customType = customTypes.find(
          (type) => type.id === record.customRecordTypeId,
        );
        const recordTypeLabel =
          customType?.label ?? BUILT_IN_LABELS[record.recordType] ?? 'Custom record';

        return (
          <div
            key={record.id}
            className='flex items-center justify-between gap-3 py-3 first:pt-0'
          >
            <div className='min-w-0'>
              <strong className='block truncate text-sm'>{record.fileName}</strong>
              <div className='text-muted-foreground text-sm'>
                {recordTypeLabel}
                {record.recordDate !== null && ` · ${formatDateTime(record.recordDate)}`}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <Button
                href={record.fileURL}
                target='_blank'
                rel='noreferrer'
                variant='link'
                size='sm'
              >
                Open
              </Button>
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={() => onEdit(record)}
              >
                Edit
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default HealthRecordList;
