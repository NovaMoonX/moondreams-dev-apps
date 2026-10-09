import type { ReactNode } from 'react';

interface TheaterRowProps {
  name: string;
  detail: string;
  trailing?: ReactNode;
  /** Spans the bottom of the row, for an action that belongs to this theater alone. */
  footer?: ReactNode;
}

function TheaterRow({ name, detail, trailing, footer }: TheaterRowProps) {
  return (
    <li className='px-3 py-2.5'>
      <div className='flex items-start gap-3'>
        <span
          className='bg-secondary mt-1 grid size-9 shrink-0 place-items-center rounded-full text-lg'
          aria-hidden='true'
        >
          📍
        </span>
        <div className='min-h-11 min-w-0 flex-1'>
          <p className='truncate font-medium'>{name}</p>
          {detail && (
            <p className='text-muted-foreground truncate text-sm'>{detail}</p>
          )}
        </div>
        {trailing && (
          <div className='flex h-11 shrink-0 items-center'>{trailing}</div>
        )}
      </div>
      {footer && <div className='mt-1'>{footer}</div>}
    </li>
  );
}

export default TheaterRow;
