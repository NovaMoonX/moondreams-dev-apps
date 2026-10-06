import type { ReactNode } from 'react';

interface TheaterRowProps {
  name: string;
  detail: string;
  trailing?: ReactNode;
}

function TheaterRow({ name, detail, trailing }: TheaterRowProps) {
  return (
    <li className='flex items-center gap-3 px-3 py-2.5'>
      <span
        className='bg-secondary grid size-9 shrink-0 place-items-center rounded-full text-lg'
        aria-hidden='true'
      >
        📍
      </span>
      <div className='min-w-0 flex-1'>
        <p className='truncate font-medium'>{name}</p>
        {detail && (
          <p className='text-muted-foreground truncate text-sm'>{detail}</p>
        )}
      </div>
      {trailing}
    </li>
  );
}

export default TheaterRow;
