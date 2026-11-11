import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import type { OpenNote } from '@apps/helm/types';

interface NoteRowProps {
  note: OpenNote;
  onOpen: (noteId: string) => void;
  /** Where the note is filed, shown under it in search results. */
  topicLine?: string;
}

const PREVIEW_CHARS = 200;

/** One note in a list: its title and the start of its words. */
function NoteRow({ note, onOpen, topicLine }: NoteRowProps) {
  const preview = note.body.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS);
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(note.id)}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-1 text-[15px] leading-[21px] break-words'>
          {note.title || HELM_COPY.noteUntitled}
        </span>
        {preview && (
          <span className='text-muted-foreground line-clamp-1 text-[13px] break-words'>
            {preview}
          </span>
        )}
        {topicLine && (
          <span className='text-muted-foreground line-clamp-1 text-[13px] break-words'>
            {topicLine}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default NoteRow;
