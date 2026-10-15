import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { NotebookPen } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import FormSection from '@/components/FormSection';
import { useAppSelector } from '@/store';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import {
  RECIPE_NOTES_FIRST_PAGE,
  RECIPE_NOTES_PAGE_SIZE,
  SOFT_MAX_RECIPE_NOTES,
} from '@apps/pinch/constants';
import {
  selectCooksById,
  selectNoteSummaries,
  selectNotesByRecipe,
  selectNotesLoadError,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { getWrittenBefore, isNoteHistoryFull } from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const HIDDEN_WORTH_A_BUTTON = 3;

interface RecipeNotesProps {
  recipeId: string;
  onAdd: () => void;
  onEdit: (noteId: string) => void;
  onApply: (noteId: string) => void;
}

function RecipeNotes({ recipeId, onAdd, onEdit, onApply }: RecipeNotesProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const cooksById = useAppSelector(selectCooksById);
  const isLoaded = useAppSelector((state) => state.pinch.notes.isLoaded);
  const loadError = useAppSelector(selectNotesLoadError);
  const [limit, setLimit] = useState(RECIPE_NOTES_FIRST_PAGE);

  if (loadError !== null) {
    return (
      <FormSection title='Notes'>
        <p className='text-muted-foreground text-sm'>
          Your notes couldn't load just now.
        </p>
      </FormSection>
    );
  }

  const isFull = isNoteHistoryFull(notes.length);
  const getAddSubtitle = () => {
    if (!isLoaded) return 'Loading your notes…';
    if (isFull) {
      return `This recipe's notes are full (${SOFT_MAX_RECIPE_NOTES}). Delete an older one to add more.`;
    }
    return 'Something to remember next time';
  };

  const hidden = notes.length - limit;
  const visibleCount = hidden > HIDDEN_WORTH_A_BUTTON ? limit : notes.length;
  const isCollapsible =
    visibleCount === notes.length &&
    notes.length > RECIPE_NOTES_FIRST_PAGE + HIDDEN_WORTH_A_BUTTON;

  const addRow = (
    <ActionRow
      icon={<NotebookPen className='h-4 w-4' />}
      label='Add a note'
      subtitle={getAddSubtitle()}
      isDisabled={!isLoaded || isFull}
      onClick={onAdd}
    />
  );

  if (notes.length === 0) {
    return addRow;
  }

  return (
    <FormSection title='Notes' detail={notes.length}>
      {addRow}
      <ul className='divide-border divide-y'>
        {notes.slice(0, visibleCount).map((note) => {
          const cookId = note.cookId ?? null;
          return (
            <NoteEntry
              key={note.id}
              note={note}
              cook={cookId === null ? null : (cooksById.get(cookId) ?? null)}
              writtenBefore={getWrittenBefore(note, lastTweakAt)}
              onEdit={onEdit}
              onApply={onApply}
            />
          );
        })}
      </ul>
      {(hidden > HIDDEN_WORTH_A_BUTTON || isCollapsible) && (
        <Button
          type='button'
          variant='tertiary'
          className='h-10 justify-start px-0!'
          onClick={() =>
            setLimit(
              isCollapsible
                ? RECIPE_NOTES_FIRST_PAGE
                : limit + RECIPE_NOTES_PAGE_SIZE,
            )
          }
        >
          {isCollapsible
            ? 'Show fewer'
            : `Show ${Math.min(RECIPE_NOTES_PAGE_SIZE, hidden)} more`}
        </Button>
      )}
    </FormSection>
  );
}

export default RecipeNotes;
