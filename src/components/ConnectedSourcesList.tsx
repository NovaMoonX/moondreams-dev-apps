import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, TriangleAlert } from 'lucide-react';

export interface ConnectedSourceRow {
  id: string;
  logo: ReactNode;
  title: string;
  /** One quiet line: what is read, or what went wrong. */
  meta: string;
  isTrouble: boolean;
}

interface ConnectedSourcesListProps {
  rows: ConnectedSourceRow[];
  onOpen: (id: string) => void;
}

/** One full-width row per connection (logo, name, a line of what it reads, chevron); the caller writes the words and the row opens whatever it stands for. */
function ConnectedSourcesList({ rows, onOpen }: ConnectedSourcesListProps) {
  return (
    <ul className='divide-border divide-y overflow-hidden'>
      {rows.map((row) => (
        <li key={row.id}>
          <Button
            type='button'
            variant='tertiary'
            className='flex h-auto min-h-12 w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
            onClick={() => onOpen(row.id)}
          >
            {row.logo}
            <span className='min-w-0 flex-1'>
              <span className='text-foreground block text-[15px] leading-[21px] break-words'>
                {row.title}
              </span>
              <span className='text-muted-foreground flex items-start gap-1 text-[13px]'>
                {row.isTrouble && (
                  <TriangleAlert
                    className='mt-0.5 size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                )}
                <span className='min-w-0 break-words'>{row.meta}</span>
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default ConnectedSourcesList;
