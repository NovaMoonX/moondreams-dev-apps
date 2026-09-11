import type { Cat } from '@apps/nine-lives/types';
import { formatDateTime } from '@/utils';

interface CatCardProps {
  cat: Cat;
  onClick?: (cat: Cat) => void;
}

function CatCard({ cat, onClick }: CatCardProps) {
  const dateLabel =
    cat.dateOfBirth > 0 ? formatDateTime(cat.dateOfBirth) : 'Unknown DOB';

  return (
    <button
      type='button'
      onClick={() => onClick?.(cat)}
      className='w-full rounded-lg border border-border bg-card p-4 text-left transition hover:border-muted-foreground/50 hover:bg-muted/30'
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-lg font-semibold'>{cat.name}</h3>
          <p className='text-sm text-muted-foreground'>{cat.breed}</p>
        </div>
        <span className='rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground'>
          {cat.lifestyle ?? 'Indoor'}
        </span>
      </div>

      <dl className='mt-4 space-y-2 text-sm text-muted-foreground'>
        <div className='flex justify-between gap-3'>
          <dt>Born</dt>
          <dd className='text-foreground'>{dateLabel}</dd>
        </div>
        <div className='flex justify-between gap-3'>
          <dt>Microchip</dt>
          <dd className='text-foreground'>
            {cat.microchipNumber ?? 'Not recorded'}
          </dd>
        </div>
      </dl>
    </button>
  );
}

export default CatCard;
