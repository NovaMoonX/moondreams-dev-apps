import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import type { RecipeNote } from '@apps/pinch/types';
import { formatChangeWhen, getChangeByLine } from '@apps/pinch/utils/notes';

interface ChangeRowProps {
  note: RecipeNote;
  onOpen: (noteId: string) => void;
}

/** One recorded change in a history list: who and when, a line of what changed, and a chevron to its sheet. */
function ChangeRow({ note, onOpen }: ChangeRowProps) {
  const by = getChangeByLine(note, formatChangeWhen);
  const first = note.changes?.[0] ?? null;
  const more = (note.changes?.length ?? 0) - 1;

  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        aria-label={`Open the change: ${by}`}
        className='h-auto min-h-12 w-full items-start justify-start gap-3 px-0! py-3 text-left'
        onClick={() => onOpen(note.id)}
      >
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-sm font-medium wrap-break-word'>
            {by}
          </span>
          {first !== null && (
            <span className='text-muted-foreground block text-sm font-normal wrap-break-word'>
              {more > 0 ? `${first} and ${more} more` : first}
            </span>
          )}
        </span>
        <ChevronRight
          className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

export default ChangeRow;
