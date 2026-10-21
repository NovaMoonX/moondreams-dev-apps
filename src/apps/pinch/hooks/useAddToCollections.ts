import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  addRecipesToCollections,
  undoAddToCollections,
  type AddedToRecipe,
} from '@apps/pinch/store/actions/collectionActions';
import { selectCollections } from '@apps/pinch/store/selectors';
import {
  getAddedToCollectionsText,
  getChoiceLabels,
  getCollectionsToSave,
  getNothingAddedText,
  getUndoAddText,
  type CollectionsChoice,
} from '@apps/pinch/utils/collections';

const UNDO_TOAST_MS = 6000;

const undone = new Set<string>();

/** Puts many recipes into the collections a person picked, with one Undo that takes off only what this act added. */
export function useAddToCollections(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast, removeToast } = useToast();
  const collections = useAppSelector(selectCollections);

  const undo = async (changed: AddedToRecipe[], createdIds: string[]) => {
    try {
      const { restored } = await dispatch(
        undoAddToCollections({ uid, changed, createdIds }),
      ).unwrap();
      const text = getUndoAddText(restored, changed.length);
      if (text !== null) {
        addToast({ title: text, type: 'info' });
      }
    } catch (error) {
      addToast({
        title: "Couldn't undo that",
        description: getErrorMessage(error, 'You can change it from Recipes.'),
        type: 'error',
      });
    }
  };

  /** Resolves to a sentence for the sheet to show while it stays open (nothing was added), or null once it is done; rejects with a sentence when it could not save. */
  const add = async (recipeIds: string[], choice: CollectionsChoice) => {
    const { collectionIds, newCollections } = getCollectionsToSave(
      choice,
      collections,
    );
    const labels = getChoiceLabels(
      { ids: collectionIds, added: newCollections },
      collections,
    );
    const result = await dispatch(
      addRecipesToCollections({
        uid,
        recipeIds,
        collectionIds,
        newCollections,
      }),
    ).unwrap();
    const summary = {
      labels,
      changed: result.changed.length,
      alreadyIn: result.alreadyIn,
      atCap: result.atCap,
      gone: result.gone,
    };
    if (summary.changed === 0) return getNothingAddedText(summary);

    const { title, description } = getAddedToCollectionsText(summary);
    const id = generateUuid();
    addToast({
      id,
      title,
      description: result.error ?? description ?? undefined,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          removeToast(id);
          if (undone.has(id)) return;

          undone.add(id);
          void undo(result.changed, result.createdIds);
        },
      },
    });
    return null;
  };

  return add;
}
