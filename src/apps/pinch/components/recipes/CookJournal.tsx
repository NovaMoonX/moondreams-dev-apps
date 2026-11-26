import { useState } from 'react';

import { Label } from '@moondreamsdev/dreamer-ui/components';
import { Link } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import { COOK_LINK_WINDOW_MS } from '@apps/pinch/constants';
import { attachNotesToCook } from '@apps/pinch/store/actions/noteActions';
import {
  selectCooksByRecipe,
  selectNoteSummaries,
  selectNotesByRecipe,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Cook, RecipeNote } from '@apps/pinch/types';
import {
  getUnlinkedNearCook,
  getWrittenBefore,
  isStepLost,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];
const NO_COOKS: Cook[] = [];

/** "A tip and 2 changes", "A note": what a set of entries is, from their kinds. */
const describeKinds = (entries: RecipeNote[]) => {
  const count = (kind: RecipeNote['kind']) =>
    entries.filter((entry) => entry.kind === kind).length;
  const part = (n: number, one: string, many: string) =>
    n === 0 ? [] : [n === 1 ? `a ${one}` : `${n} ${many}`];
  const parts = [
    ...part(count('TIP'), 'tip', 'tips'),
    ...part(count('NOTE'), 'note', 'notes'),
    ...part(count('CHANGE'), 'change', 'changes'),
  ];
  const line =
    parts.length < 2
      ? parts.join('')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${line[0].toUpperCase()}${line.slice(1)}`;
};

interface CookJournalProps {
  uid: string;
  recipeId: string;
  cookId: string;
  onEdit: (noteId: string) => void;
  onApplyChange: (noteId: string) => void;
  /** Ids of the recorded changes that can be undone right now. */
  undoableIds: string[];
  onUndo: (noteId: string) => void;
  /** Why the last undo did not happen. */
  undoError: string | null;
}

/** What came out of one cook: the tips, notes and changes written for it while cooking or after, and an offer to link loose ones written that day. */
function CookJournal({
  uid,
  recipeId,
  cookId,
  onEdit,
  onApplyChange,
  undoableIds,
  onUndo,
  undoError,
}: CookJournalProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;

  const cooks = useAppSelector(selectCooksByRecipe).get(recipeId) ?? NO_COOKS;
  const dispatch = useAppDispatch();
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const cook = cooks.find((entry) => entry.id === cookId);
  const loose =
    cook === undefined
      ? []
      : getUnlinkedNearCook(notes, cook, cooks, COOK_LINK_WINDOW_MS);
  const linkLoose = async () => {
    setLinkError(null);
    setIsLinking(true);
    try {
      await dispatch(
        attachNotesToCook({
          uid,
          recipeId,
          cookId,
          noteIds: loose.map((entry) => entry.id),
        }),
      ).unwrap();
    } catch (error) {
      setLinkError(getErrorMessage(error, 'Unable to link these.'));
    }
    setIsLinking(false);
  };

  const fromCook = notes
    .filter((note) => note.cookId === cookId)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (fromCook.length === 0 && loose.length === 0) return null;

  return (
    <div className='space-y-1'>
      <Label className='text-muted-foreground text-xs'>From this cook</Label>
      {loose.length > 0 && (
        <div className='space-y-1 pb-1'>
          <ActionRow
            icon={<Link className='h-4 w-4' />}
            label={`${describeKinds(loose)} you wrote that day ${loose.length === 1 ? "isn't" : "aren't"} linked to a cook`}
            subtitle='Link them here'
            isDisabled={isLinking}
            onClick={() => void linkLoose()}
          />
          {linkError && <p className='text-destructive text-sm'>{linkError}</p>}
        </div>
      )}
      <ul className='divide-border divide-y'>
        {fromCook.map((note) => (
          <NoteEntry
            key={note.id}
            note={note}
            cook={null}
            writtenBefore={getWrittenBefore(note, lastTweakAt)}
            stepAt={resolveNoteStep(note, steps)}
            isStepLost={isStepLost(note, steps)}
            isInCook
            onEdit={onEdit}
            onApplyChange={onApplyChange}
            onUndo={undoableIds.includes(note.id) ? onUndo : null}
          />
        ))}
      </ul>
      {undoError && <p className='text-destructive text-sm'>{undoError}</p>}
    </div>
  );
}

export default CookJournal;
