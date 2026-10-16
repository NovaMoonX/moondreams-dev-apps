import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown } from 'lucide-react';

import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import {
  RECIPE_NOTES_FIRST_PAGE,
  RECIPE_NOTES_PAGE_SIZE,
} from '@apps/pinch/constants';
import {
  selectCooksById,
  selectNoteSummaries,
  selectNotesByRecipe,
  selectNotesLoadError,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { getNoteSummary, getWrittenBefore } from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const HIDDEN_WORTH_A_BUTTON = 3;
const NEXT_TIME = /[.!?]\s+(?=next time\b)/i;

const leadWithAdvice = (text: string) => {
  const match = NEXT_TIME.exec(text);
  return match ? `…${text.slice(match.index + match[0].length)}` : text;
};

interface CookNotesProps {
  recipeId: string;
  onApply: (noteId: string) => void;
}

function CookNotes({ recipeId, onApply }: CookNotesProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const cooksById = useAppSelector(selectCooksById);
  const isReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [limit, setLimit] = useState(RECIPE_NOTES_FIRST_PAGE);

  const latest = notes.find((entry) => entry.kind === 'NOTE') ?? null;
  if (!isReady || latest === null) {
    return null;
  }

  const summary = getNoteSummary(latest, formatDateShort);
  const isChangedSince = lastTweakAt !== null && lastTweakAt > latest.createdAt;
  const hidden = notes.length - limit;
  const visibleCount = hidden > HIDDEN_WORTH_A_BUTTON ? limit : notes.length;

  return (
    <section
      aria-label='Notes for this recipe'
      className='bg-muted/50 border-border overflow-hidden rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        aria-expanded={isOpen}
        className='text-foreground! h-auto min-h-11 w-full items-start justify-between gap-2 rounded-none px-3 py-2.5 text-left font-normal'
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden='true' className='w-5 shrink-0 text-center text-sm'>
          📝
        </span>
        {isOpen ? (
          <span className='min-w-0 flex-1 text-sm font-medium'>
            Your notes ({notes.length})
          </span>
        ) : (
          <span className='min-w-0 flex-1'>
            <span className='line-clamp-1 text-sm wrap-break-word'>
              <span className='font-medium'>
                <span className='sr-only'>Your latest note, </span>
                {formatDateShort(latest.createdAt)}:
              </span>{' '}
              {leadWithAdvice(summary.body)}
            </span>
            {isChangedSince && (
              <span className='text-muted-foreground block text-xs'>
                You've changed the recipe since.
              </span>
            )}
          </span>
        )}
        <ChevronDown
          className={join(
            'text-muted-foreground mt-0.5 h-4 w-4 shrink-0',
            isOpen && 'rotate-180',
          )}
          aria-hidden='true'
        />
      </Button>
      {isOpen && (
        <div className='border-border border-t px-3'>
          <ul className='divide-border divide-y'>
            {notes.slice(0, visibleCount).map((note) => {
              const cookId = note.cookId ?? null;
              return (
                <NoteEntry
                  key={note.id}
                  note={note}
                  cook={
                    cookId === null ? null : (cooksById.get(cookId) ?? null)
                  }
                  writtenBefore={getWrittenBefore(note, lastTweakAt)}
                  onEdit={null}
                  onApply={onApply}
                />
              );
            })}
          </ul>
          {hidden > HIDDEN_WORTH_A_BUTTON && (
            <Button
              type='button'
              variant='tertiary'
              className='h-10 justify-start px-0!'
              onClick={() => setLimit(limit + RECIPE_NOTES_PAGE_SIZE)}
            >
              Show {Math.min(RECIPE_NOTES_PAGE_SIZE, hidden)} more
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export default CookNotes;
