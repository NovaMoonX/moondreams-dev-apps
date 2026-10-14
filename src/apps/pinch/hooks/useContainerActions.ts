import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import {
  addContainer,
  eatContainer,
  removeContainer,
  tossContainer,
  undoContainerEnd,
} from '@apps/pinch/store/actions/containerActions';
import {
  selectContainersLoadError,
  selectIsContainersReady,
} from '@apps/pinch/store/selectors';
import type { Container } from '@apps/pinch/types';
import {
  getSavedText,
  type NewContainerInput,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const UNDO_TOAST_MS = 6000;

/** Putting food away and eating it, each with its toast and an Undo; every call rejects with one sentence for the caller to show. */
export function useContainerActions(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const isReady = useAppSelector(selectIsContainersReady);
  const loadError = useAppSelector(selectContainersLoadError);

  const showUndoFailed = () =>
    addToast({
      title: "Couldn't undo that",
      description: 'You can change it from Prepared meals.',
      type: 'error',
    });

  const undoPutAway = async (id: string) => {
    try {
      await dispatch(removeContainer({ uid, id })).unwrap();
    } catch {
      showUndoFailed();
    }
  };

  const undoEnd = async (id: string, at: number) => {
    try {
      await dispatch(undoContainerEnd({ uid, id, at })).unwrap();
    } catch {
      showUndoFailed();
    }
  };

  const putAway = async (container: Omit<NewContainerInput, 'id'>) => {
    const created = await dispatch(addContainer({ uid, container })).unwrap();
    addToast({
      title: getSavedText(created),
      description: created.title,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: { label: 'Undo', onClick: () => void undoPutAway(created.id) },
    });
    return created;
  };

  const eat = async (container: Container, count: number | 'ALL') => {
    const { at, isFinished } = await dispatch(
      eatContainer({ uid, id: container.id, count }),
    ).unwrap();
    const eaten = count === 'ALL' ? container.servings : count;
    addToast({
      title: isFinished
        ? `Finished ${container.title}`
        : `Ate ${formatServings(eaten)}`,
      description: isFinished ? undefined : container.title,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => void undoEnd(container.id, at),
      },
    });
    return isFinished;
  };

  const toss = async (container: Container) => {
    const { at } = await dispatch(
      tossContainer({ uid, id: container.id }),
    ).unwrap();
    addToast({
      title: `Threw out ${container.title}`,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => void undoEnd(container.id, at),
      },
    });
  };

  return { isReady, loadError, putAway, undoPutAway, eat, toss };
}
