import { useMemo, useState } from 'react';

import { Button, Input, Pagination, Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatDateTime } from '@/utils/formatUtils';

import type { Cat, CustomHealthRecordType, HealthRecord, HealthRecordType } from '../types';
import { usePagination } from '../utils/usePagination';

const PAGE_SIZE = 5;

interface HealthRecordTimelineProps {
  records: HealthRecord[];
  cats: Cat[];
  customTypes: CustomHealthRecordType[];
  onEdit: (record: HealthRecord) => void;
}

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

const SORT_OPTIONS: { text: string; value: SortOption }[] = [
  { text: 'Date: newest first', value: 'date_desc' },
  { text: 'Date: oldest first', value: 'date_asc' },
  { text: 'Name: A to Z', value: 'name_asc' },
  { text: 'Name: Z to A', value: 'name_desc' },
];

const BUILT_IN_LABELS: Record<HealthRecordType, string> = {
  lab_result: 'Lab result',
  vet_paperwork: 'Vet paperwork',
  insurance: 'Insurance',
  shelter_adoption: 'Adoption / shelter',
  prescription: 'Prescription',
  microchip_registration: 'Microchip registration',
  miscellaneous: 'Miscellaneous',
  custom: 'Custom record',
};

function getRecordTypeLabel(record: HealthRecord, customTypes: CustomHealthRecordType[]): string {
  const customType = customTypes.find((type) => type.id === record.customRecordTypeId);
  return customType?.label ?? BUILT_IN_LABELS[record.recordType] ?? 'Custom record';
}

function HealthRecordTimeline({
  records,
  cats,
  customTypes,
  onEdit,
}: HealthRecordTimelineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOption, setSortOption] = useState<SortOption>('date_desc');

  const catFilterOptions = useMemo(
    () => [
      { text: 'All cats', value: 'all' },
      ...cats.map((cat) => ({ text: cat.name, value: cat.id })),
    ],
    [cats],
  );

  const typeFilterOptions = useMemo(() => {
    const builtInValues = new Set(records.map((record) => record.recordType));

    return [
      { text: 'All types', value: 'all' },
      ...(Object.keys(BUILT_IN_LABELS) as HealthRecordType[])
        .filter((type) => type !== 'custom' && builtInValues.has(type))
        .map((type) => ({ text: BUILT_IN_LABELS[type], value: type })),
      ...customTypes.map((type) => ({ text: type.label, value: `custom:${type.id}` })),
    ];
  }, [records, customTypes]);

  const visibleRecords = useMemo(() => {
    const searchTerm = searchQuery.trim().toLowerCase();

    const filtered = records.filter((record) => {
      if (catFilter !== 'all' && !record.catIds.includes(catFilter)) {
        return false;
      }

      if (typeFilter !== 'all') {
        if (typeFilter.startsWith('custom:')) {
          if (record.customRecordTypeId !== typeFilter.slice('custom:'.length)) {
            return false;
          }
        } else if (record.recordType !== typeFilter) {
          return false;
        }
      }

      if (!searchTerm) {
        return true;
      }

      const catNames = record.catIds
        .map((catId) => cats.find((cat) => cat.id === catId)?.name ?? '')
        .join(' ');
      const searchableText = [
        record.label ?? '',
        record.fileName,
        getRecordTypeLabel(record, customTypes),
        catNames,
        record.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });

    return [...filtered].sort((left, right) => {
      switch (sortOption) {
        case 'date_asc':
          return (left.recordDate ?? left.createdAt) - (right.recordDate ?? right.createdAt);
        case 'name_asc':
          return (left.label ?? left.fileName).localeCompare(right.label ?? right.fileName);
        case 'name_desc':
          return (right.label ?? right.fileName).localeCompare(left.label ?? left.fileName);
        case 'date_desc':
        default:
          return (right.recordDate ?? right.createdAt) - (left.recordDate ?? left.createdAt);
      }
    });
  }, [records, cats, customTypes, searchQuery, catFilter, typeFilter, sortOption]);

  const hasRecords = records.length > 0;
  const { page, pageCount, setPage, pagedItems, shouldPaginate } = usePagination(visibleRecords, PAGE_SIZE);

  return (
    <div>
      {hasRecords && (
        <div className='mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2'>
          <div className='min-w-40 flex-1'>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder='Search records'
              variant='outline'
            />
          </div>

          <div className='flex gap-2'>
            <span className='text-muted-foreground shrink-0 pt-1 text-sm'>Filter by:</span>
            <div className='flex flex-wrap items-center gap-2'>
              {cats.length > 1 && (
                <div className='max-w-36 flex-1'>
                  <Select
                    options={catFilterOptions}
                    value={catFilter}
                    onChange={setCatFilter}
                    size='sm'
                  />
                </div>
              )}
              <div className='max-w-44 flex-1'>
                <Select
                  options={typeFilterOptions}
                  value={typeFilter}
                  onChange={setTypeFilter}
                  size='sm'
                />
              </div>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>Sort by:</span>
            <div className='max-w-48 flex-1'>
              <Select
                options={SORT_OPTIONS}
                value={sortOption}
                onChange={(value) => setSortOption(value as SortOption)}
                size='sm'
              />
            </div>
          </div>
        </div>
      )}

      {visibleRecords.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {hasRecords ? 'No records match your search or filters.' : 'No health records yet.'}
        </p>
      ) : (
        <div className={join('divide-border divide-y', hasRecords && 'mt-0')}>
          {pagedItems.map((record) => {
            const catNames = record.catIds
              .map((catId) => cats.find((cat) => cat.id === catId)?.name)
              .filter((name): name is string => Boolean(name));

            return (
              <div
                key={record.id}
                className='flex items-center justify-between gap-3 py-3 first:pt-0'
              >
                <div className='min-w-0'>
                  <strong className='block truncate text-sm'>
                    {record.label ?? record.fileName}
                  </strong>
                  <div className='text-muted-foreground text-sm'>
                    {getRecordTypeLabel(record, customTypes)}
                    {catNames.length > 0 && ` · ${catNames.join(', ')}`}
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
      )}

      {shouldPaginate && (
        <div className='mt-3 flex justify-center'>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} size='sm' showFirstLast={pageCount >= 5} />
        </div>
      )}
    </div>
  );
}

export default HealthRecordTimeline;
