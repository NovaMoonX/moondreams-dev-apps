import { useRef, useState } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  addSharedMeal,
  addSharedRecipe,
  undoSharedImport,
} from '@apps/pinch/store/actions/importShareActions';
import {
  UNDO_BLOCKED_PROBLEM,
  getUndoneMessage,
  type ShareImportWritten,
  type ShareTarget,
} from '@apps/pinch/utils/importShare';

export type ShareAddState =
  | {
      phase: 'idle';
      notice: string | null;
      error: string | null;
    }
  | { phase: 'adding' }
  | {
      phase: 'added';
      written: ShareImportWritten;
      isUndoing: boolean;
      canUndo: boolean;
      undoError: string | null;
    };

const IDLE: ShareAddState = { phase: 'idle', notice: null, error: null };

interface UseShareAddInput {
  uid: string;
  shareId: string;
  target: ShareTarget;
}

/** A second tap while an add or an Undo is under way does nothing. */
export function useShareAdd({ uid, shareId, target }: UseShareAddInput) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<ShareAddState>(IDLE);
  const isBusyRef = useRef(false);

  const add = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setState({ phase: 'adding' });
    try {
      const written = await (target.kind === 'MEAL'
        ? dispatch(addSharedMeal({ uid, shareId, meal: target.meal })).unwrap()
        : dispatch(
            addSharedRecipe({ uid, shareId, recipe: target.recipe }),
          ).unwrap());
      setState({
        phase: 'added',
        written,
        isUndoing: false,
        canUndo: true,
        undoError: null,
      });
    } catch (error) {
      setState({
        phase: 'idle',
        notice: null,
        error: getErrorMessage(error, "Couldn't add it just now."),
      });
    } finally {
      isBusyRef.current = false;
    }
  };

  const undo = async () => {
    if (state.phase !== 'added' || isBusyRef.current) return;
    isBusyRef.current = true;
    const added = state;
    setState({ ...added, isUndoing: true, undoError: null });
    try {
      const { keptIngredients } = await dispatch(
        undoSharedImport({ uid, written: added.written }),
      ).unwrap();
      setState({
        phase: 'idle',
        notice: getUndoneMessage(keptIngredients),
        error: null,
      });
    } catch (error) {
      const message = getErrorMessage(error, "Couldn't undo that just now.");
      setState({
        ...added,
        isUndoing: false,
        canUndo: message !== UNDO_BLOCKED_PROBLEM,
        undoError: message,
      });
    } finally {
      isBusyRef.current = false;
    }
  };

  return { state, add, undo };
}
