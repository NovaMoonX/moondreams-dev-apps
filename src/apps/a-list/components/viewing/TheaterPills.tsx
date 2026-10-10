import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import Pill from '@/components/Pill';
import { useAppSelector } from '@/store';
import TheaterSheetModal from '@apps/a-list/components/theaters/TheaterSheetModal';
import { MAX_THEATRES } from '@apps/a-list/constants';
import { selectTheatres } from '@apps/a-list/store/selectors';
import type { TheatreSnapshot } from '@apps/a-list/types';
import { toTheatreSnapshot } from '@apps/a-list/utils/theatres';

interface TheaterPillsProps {
  label: string;
  value: TheatreSnapshot | null;
  onChange: (theatre: TheatreSnapshot | null) => void;
}

function TheaterPills({ label, value, onChange }: TheaterPillsProps) {
  const theatres = useAppSelector(selectTheatres);
  const [isAdding, setIsAdding] = useState(false);
  const options = theatres.map((theatre) => toTheatreSnapshot(theatre));
  const choices =
    value && !options.some((option) => option.theatreId === value.theatreId)
      ? [value, ...options]
      : options;

  return (
    <div className='space-y-2'>
      <p className='font-medium'>{label}</p>
      <div className='flex flex-wrap gap-2'>
        {theatres.length < MAX_THEATRES && (
          <Button
            type='button'
            size='sm'
            rounded='full'
            variant='secondary'
            className='border-primary/60 shrink-0 border border-dashed whitespace-nowrap !transition-none'
            onClick={() => setIsAdding(true)}
          >
            + Add theater
          </Button>
        )}
        {choices.map((theatre) => {
          const isSelected = value?.theatreId === theatre.theatreId;
          return (
            <Pill
              key={theatre.theatreId}
              isSelected={isSelected}
              onClick={() => onChange(isSelected ? null : theatre)}
            >
              {theatre.name}
            </Pill>
          );
        })}
      </div>
      {isAdding && (
        <TheaterSheetModal
          linking={null}
          onClose={() => setIsAdding(false)}
          onDone={onChange}
        />
      )}
    </div>
  );
}

export default TheaterPills;
