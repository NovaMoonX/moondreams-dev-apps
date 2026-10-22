import { useState } from 'react';

import ContainerFormSheet from '@apps/pinch/components/containers/ContainerFormSheet';
import CookingHistorySheet from '@apps/pinch/components/recipes/CookingHistorySheet';
import type { WrittenNoteKind } from '@apps/pinch/components/notes/NoteKindPills';
import NoteSheet from '@apps/pinch/components/notes/NoteSheet';
import RecipeDrawer from '@apps/pinch/components/recipes/RecipeDrawer';
import AddToShoppingSheet from '@apps/pinch/components/shared/AddToShoppingSheet';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import type { Gap, ShoppingRequest } from '@apps/pinch/types';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';

type Side =
  | { kind: 'fillIn'; gaps: Gap[] }
  | { kind: 'shopping'; request: ShoppingRequest }
  | { kind: 'history'; recipeId: string }
  | { kind: 'putAway'; recipeId: string }
  | {
      kind: 'note';
      recipeId: string;
      noteId: string | null;
      noteKind: WrittenNoteKind | null;
    };

interface PantryRecipeDrawerProps {
  uid: string;
  recipeId: string;
  /** The drawer, or the sheet it handed over to, closed: back to the pantry. */
  onClose: () => void;
}

/** A recipe's drawer opened from the pantry, with the sheets it hands over to, so looking at a recipe never leaves the screen the person was on; what takes them to another screen (planning, cooking, modifying) replaces the pantry as it would anywhere. */
function PantryRecipeDrawer({
  uid,
  recipeId,
  onClose,
}: PantryRecipeDrawerProps) {
  const { openSubview } = usePinchOverlay();
  const [side, setSide] = useState<Side | null>(null);

  return (
    <>
      {side === null && (
        <RecipeDrawer
          uid={uid}
          recipeId={recipeId}
          onClose={onClose}
          onPlan={(id) =>
            openSubview({
              kind: 'plan',
              dayKey: getCellDayKey(new Date()),
              mealType: null,
              plannedMealId: null,
              fromMealId: null,
              fromRecipeId: id,
            })
          }
          onModify={(id) => openSubview({ kind: 'recipe', id })}
          onFillIn={(gaps) => setSide({ kind: 'fillIn', gaps })}
          onAddToShopping={(request) => setSide({ kind: 'shopping', request })}
          onOpenHistory={(id) => setSide({ kind: 'history', recipeId: id })}
          onOpenStock={(id, place) =>
            openSubview({ kind: 'containers', recipeId: id, place })
          }
          onPutAway={(id) => setSide({ kind: 'putAway', recipeId: id })}
          onOpenNote={(id, noteId, noteKind = null) =>
            setSide({ kind: 'note', recipeId: id, noteId, noteKind })
          }
        />
      )}
      {side?.kind === 'fillIn' && (
        <FillInSheet uid={uid} gaps={side.gaps} onClose={onClose} />
      )}
      {side?.kind === 'shopping' && (
        <AddToShoppingSheet
          uid={uid}
          request={side.request}
          onClose={onClose}
        />
      )}
      {side?.kind === 'history' && (
        <CookingHistorySheet
          uid={uid}
          recipeId={side.recipeId}
          onClose={onClose}
        />
      )}
      {side?.kind === 'putAway' && (
        <ContainerFormSheet
          uid={uid}
          initial={{ kind: 'recipe', id: side.recipeId }}
          onClose={onClose}
        />
      )}
      {side?.kind === 'note' && (
        <NoteSheet
          uid={uid}
          recipeId={side.recipeId}
          noteId={side.noteId}
          initialCookId={null}
          initialKind={side.noteKind}
          onClose={onClose}
        />
      )}
    </>
  );
}

export default PantryRecipeDrawer;
