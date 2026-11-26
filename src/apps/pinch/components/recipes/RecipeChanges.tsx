import { useState } from 'react';

import FormSection from '@/components/FormSection';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import ChangeRow from '@apps/pinch/components/notes/ChangeRow';
import {
  selectNotesLoadError,
  selectNotesByRecipe,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';

const NO_NOTES: RecipeNote[] = [];
const FIRST_SHOWN = 3;

interface RecipeChangesProps {
  recipeId: string;
  /** Opens an edit's own view, which the host swaps into its sheet. */
  onOpenChange: (noteId: string) => void;
}

/** The recipe's edits: every save already made, newest first, each opening its own view. */
function RecipeChanges({ recipeId, onOpenChange }: RecipeChangesProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const isNotesReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const [limit, setLimit] = useState(FIRST_SHOWN);

  const edits = notes
    .filter((note) => note.kind === 'TWEAK')
    .sort((a, b) => b.createdAt - a.createdAt);
  if (edits.length === 0) {
    return isNotesReady ? (
      <FormSection title='Edits'>
        <p className='text-muted-foreground text-sm'>
          Nothing edited yet. Each time this recipe is saved, it shows up here.
        </p>
      </FormSection>
    ) : null;
  }

  const hidden = edits.length - limit;
  const shown = hidden > 1 ? edits.slice(0, limit) : edits;

  return (
    <FormSection title='Edits'>
      <ul className='divide-border divide-y'>
        {shown.map((note) => (
          <ChangeRow key={note.id} note={note} onOpen={onOpenChange} />
        ))}
      </ul>
      {hidden > 1 && (
        <ShowMoreButton
          isOpen={false}
          onClick={() => setLimit(limit + FIRST_SHOWN)}
        >
          Show {Math.min(FIRST_SHOWN, hidden)} more
        </ShowMoreButton>
      )}
    </FormSection>
  );
}

export default RecipeChanges;
