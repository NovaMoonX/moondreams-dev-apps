import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { formatTimeAgo } from '@/utils/formatUtils';
import type { RecipeNote } from '@apps/pinch/types';
import { formatChangeWhen, getChangeWho } from '@apps/pinch/utils/notes';

interface ChangeRowProps {
  note: RecipeNote;
  onOpen: (noteId: string) => void;
}

/** One recorded change in a history list: who, when and a line of what changed, and a chevron to its sheet. */
function ChangeRow({ note, onOpen }: ChangeRowProps) {
  const now = useNow();
  const who = getChangeWho(note);
  const ago = formatTimeAgo(note.createdAt, now);
  const first = note.changes?.[0] ?? null;
  const more = (note.changes?.length ?? 0) - 1;

  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        aria-label={`Open the change: ${who}, ${formatChangeWhen(note.createdAt)}`}
        className='h-auto min-h-12 w-full items-start justify-start gap-3 px-0! py-3 text-left'
        onClick={() => onOpen(note.id)}
      >
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-sm font-medium wrap-break-word'>
            {who}
          </span>
          <span className='text-muted-foreground block text-sm font-normal wrap-break-word'>
            {first === null
              ? ago
              : `${ago} \u00b7 ${more > 0 ? `${first} and ${more} more` : first}`}
          </span>
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
