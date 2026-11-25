import { useState } from 'react';

import FormSection from '@/components/FormSection';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import ChangeRow from '@apps/pinch/components/notes/ChangeRow';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import {
  selectNoteSummaries,
  selectNotesByRecipe,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import {
  getWrittenBefore,
  isStepLost,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];
const FIRST_SHOWN = 3;

interface RecipeChangesProps {
  recipeId: string;
  onEdit: (noteId: string) => void;
  onApplyChange: (noteId: string) => void;
  /** Opens a recorded change's own view, which the host swaps into its sheet. */
  onOpenChange: (noteId: string) => void;
}

/** The recipe's history: the changes planned for it first, then every save already made, newest first, each opening its own view. */
function RecipeChanges({
  recipeId,
  onEdit,
  onApplyChange,
  onOpenChange,
}: RecipeChangesProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const isNotesLoaded = useAppSelector((state) => state.pinch.notes.isLoaded);
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;
  const [limit, setLimit] = useState(FIRST_SHOWN);

  const changes = notes
    .filter(
      (note) =>
        note.kind === 'TWEAK' ||
        (note.kind === 'CHANGE' && note.cookId == null),
    )
    .sort(
      (a, b) =>
        Number(b.kind === 'CHANGE') - Number(a.kind === 'CHANGE') ||
        b.createdAt - a.createdAt,
    );
  if (changes.length === 0) {
    return isNotesLoaded ? (
      <FormSection title='Changes'>
        <p className='text-muted-foreground text-sm'>
          Nothing has changed yet. Each time this recipe is saved, it shows up
          here.
        </p>
      </FormSection>
    ) : null;
  }

  const hidden = changes.length - limit;
  const shown = hidden > 1 ? changes.slice(0, limit) : changes;

  return (
    <FormSection title='Changes'>
      <ul className='divide-border divide-y'>
        {shown.map((note) =>
          note.kind === 'TWEAK' ? (
            <ChangeRow key={note.id} note={note} onOpen={onOpenChange} />
          ) : (
            <NoteEntry
              key={note.id}
              note={note}
              cook={null}
              writtenBefore={getWrittenBefore(note, lastTweakAt)}
              stepAt={resolveNoteStep(note, steps)}
              isStepLost={isStepLost(note, steps)}
              onEdit={note.kind === 'CHANGE' ? onEdit : null}
              onApplyChange={onApplyChange}
            />
          ),
        )}
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
