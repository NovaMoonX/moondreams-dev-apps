import { useState } from 'react';

import FormSection from '@/components/FormSection';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import {
  selectCooksById,
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
}

/** The changes with no cook to sit under: one written from the recipe itself, or whose cook was deleted. A change that came from a cook is on that cook's page. Planned ones first, then the edits already made. */
function RecipeChanges({ recipeId, onEdit, onApplyChange }: RecipeChangesProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const cooksById = useAppSelector(selectCooksById);
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;
  const [limit, setLimit] = useState(FIRST_SHOWN);

  const changes = notes
    .filter(
      (note) =>
        (note.kind === 'CHANGE' || note.kind === 'TWEAK') &&
        (note.cookId == null || !cooksById.has(note.cookId)),
    )
    .sort(
      (a, b) =>
        Number(b.kind === 'CHANGE') - Number(a.kind === 'CHANGE') ||
        b.createdAt - a.createdAt,
    );
  if (changes.length === 0) return null;

  const hidden = changes.length - limit;
  const shown = hidden > 1 ? changes.slice(0, limit) : changes;

  return (
    <FormSection title='Changes'>
      <ul className='divide-border divide-y'>
        {shown.map((note) => (
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
