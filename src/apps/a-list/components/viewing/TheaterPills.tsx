import Pill from '@/components/Pill';
import { useAppSelector } from '@/store';
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
  const options = theatres.map((theatre) => toTheatreSnapshot(theatre));
  const choices =
    value && !options.some((option) => option.theatreId === value.theatreId)
      ? [value, ...options]
      : options;

  if (choices.length === 0) {
    return null;
  }

  return (
    <div className='space-y-2'>
      <p className='font-medium'>{label}</p>
      <div className='flex flex-wrap gap-2'>
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
    </div>
  );
}

export default TheaterPills;
