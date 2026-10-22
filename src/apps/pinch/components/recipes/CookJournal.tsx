import { Label } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
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

interface CookJournalProps {
  recipeId: string;
  cookId: string;
  onEdit: (noteId: string) => void;
  onApplyChange: (noteId: string) => void;
}

/** What came out of one cook: the notes and changes written for it while cooking or after. A tip is the recipe's, never a cook's, so it is not here. */
function CookJournal({
  recipeId,
  cookId,
  onEdit,
  onApplyChange,
}: CookJournalProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;

  const fromCook = notes
    .filter((note) => note.cookId === cookId)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (fromCook.length === 0) return null;

  return (
    <div className='space-y-1'>
      <Label className='text-muted-foreground text-xs'>From this cook</Label>
      <ul className='divide-border divide-y'>
        {fromCook.map((note) => (
          <NoteEntry
            key={note.id}
            note={note}
            cook={null}
            writtenBefore={getWrittenBefore(note, lastTweakAt)}
            stepAt={resolveNoteStep(note, steps)}
            isStepLost={isStepLost(note, steps)}
            onEdit={onEdit}
            onApplyChange={onApplyChange}
          />
        ))}
      </ul>
    </div>
  );
}

export default CookJournal;
