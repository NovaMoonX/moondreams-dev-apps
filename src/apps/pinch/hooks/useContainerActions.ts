import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  CONTAINER_PLACE_LABELS,
  SOFT_MAX_CONTAINERS,
} from '@apps/pinch/constants';
import {
  changeContainerEatBy,
  clearOutPlace,
  correctContainerCount,
  eatContainer,
  moveContainer,
  removeContainer,
  tossContainer,
  undoClearOut,
  undoContainerBatch,
  undoContainerEnd,
  writeContainers,
  type ClearedContainer,
} from '@apps/pinch/store/actions/containerActions';
import {
  selectContainersLoadError,
  selectIsContainersReady,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  buildContainer,
  getNewContainersProblem,
  getPutBackText,
  getSavedText,
  isContainerListFull,
  type NewContainerInput,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const UNDO_TOAST_MS = 6000;

interface PutAwayOptions {
  /** False when the caller's own screen confirms the save and offers its Undo (`undoSaved`). */
  withToast?: boolean;
  /** Takes a rejected write's message instead of an error toast. */
  onWriteFailed?: (message: string) => void;
}

const inFlight = new Set<string>();
const undone = new Set<string>();

/** Ignores a second tap on the same container while its first change is still being written. */
const once = async <T>(key: string, run: () => Promise<T>) => {
  if (inFlight.has(key)) return undefined;

  inFlight.add(key);
  try {
    return await run();
  } finally {
    inFlight.delete(key);
  }
};

export function useContainerActions(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast, removeToast } = useToast();
  const isReady = useAppSelector(selectIsContainersReady);
  const loadError = useAppSelector(selectContainersLoadError);
  const inStockCount = useAppSelector(
    (state) => state.pinch.containers.items.length,
  );

  const showUndoFailed = (description: string) =>
    addToast({ title: "Couldn't undo that", description, type: 'error' });

  const addUndoToast = (
    title: string,
    description: string | undefined,
    undo: () => Promise<void>,
  ) => {
    const id = generateUuid();
    addToast({
      id,
      title,
      description,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          removeToast(id);
          if (undone.has(id)) return;

          undone.add(id);
          void undo();
        },
      },
    });
  };

  const undoPutAway = async (ids: string[]) => {
    try {
      await dispatch(undoContainerBatch({ uid, ids })).unwrap();
    } catch (error) {
      showUndoFailed(
        getErrorMessage(error, 'You can change it from Prepared meals.'),
      );
    }
  };

  const undoEnd = async (id: string, at: number) => {
    try {
      await dispatch(undoContainerEnd({ uid, id, at })).unwrap();
    } catch {
      showUndoFailed('You can change it from Prepared meals.');
    }
  };

  const getProblem = (inputs: Omit<NewContainerInput, 'id'>[]) => {
    if (loadError !== null) {
      return "Your prepared meals couldn't load, so adding is paused.";
    }
    if (!isReady) {
      return 'Your prepared meals are still loading. Try again in a moment.';
    }
    return getNewContainersProblem(inputs, inStockCount);
  };

  const putAway = async (
    inputs: Omit<NewContainerInput, 'id'>[],
    { withToast = true, onWriteFailed }: PutAwayOptions = {},
  ) => {
    const problem = getProblem(inputs);
    if (problem !== null) throw new Error(problem);

    const now = Date.now();
    const created = inputs.map((input) =>
      buildContainer({ ...input, id: generateUuid() }, now),
    );
    dispatch(writeContainers({ uid, containers: created }))
      .unwrap()
      .catch((error: string) =>
        onWriteFailed
          ? onWriteFailed(error)
          : addToast({
              title: "That didn't save",
              description: error,
              type: 'error',
            }),
      );

    if (withToast) {
      addUndoToast(
        getSavedText(created),
        navigator.onLine
          ? created[0].title
          : `${created[0].title} · Saved on this phone, it will sync when you're online`,
        () => undoPutAway(created.map(({ id }) => id)),
      );
    }
    return created;
  };

  const undoSaved = (ids: string[]) =>
    once(`batch:${ids[0]}`, () =>
      dispatch(undoContainerBatch({ uid, ids })).unwrap(),
    );

  const eat = (container: Container, count: number | 'ALL') =>
    once(container.id, async () => {
      const { at, isFinished } = await dispatch(
        eatContainer({ uid, id: container.id, count }),
      ).unwrap();
      const eaten = count === 'ALL' ? container.servings : count;
      addUndoToast(
        isFinished
          ? `Finished ${container.title}`
          : `Ate ${formatServings(eaten)}`,
        isFinished ? undefined : container.title,
        () => undoEnd(container.id, at),
      );
      return isFinished;
    });

  const toss = (container: Container) =>
    once(container.id, async () => {
      const { at } = await dispatch(
        tossContainer({ uid, id: container.id }),
      ).unwrap();
      addUndoToast(`Threw out ${container.title}`, undefined, () =>
        undoEnd(container.id, at),
      );
      return true;
    });

  const move = (container: Container, to: ContainerPlace, eatBy: number) =>
    once(container.id, () =>
      dispatch(moveContainer({ uid, id: container.id, to, eatBy })).unwrap(),
    );

  const changeEatBy = (container: Container, eatBy: number) =>
    once(container.id, () =>
      dispatch(changeContainerEatBy({ uid, id: container.id, eatBy })).unwrap(),
    );

  const correctCount = (container: Container, count: number) =>
    once(container.id, () =>
      dispatch(
        correctContainerCount({ uid, id: container.id, count }),
      ).unwrap(),
    );

  const remove = (container: Container) =>
    once(container.id, () =>
      dispatch(removeContainer({ uid, id: container.id })).unwrap(),
    );

  const undoClear = async (cleared: ClearedContainer[]) => {
    try {
      const { restored, error } = await dispatch(
        undoClearOut({ uid, cleared }),
      ).unwrap();
      if (restored === 0) {
        showUndoFailed('They changed since, so they were left as they are.');
        return;
      }
      addToast({
        title: getPutBackText(restored, cleared.length),
        description: error ?? undefined,
        type: restored === cleared.length ? 'success' : 'info',
      });
    } catch (error) {
      showUndoFailed(getErrorMessage(error, "Couldn't undo that."));
    }
  };

  /** Resolves to how many it really cleared, and a sentence when it stopped partway. */
  const clearOut = (place: ContainerPlace, ids: string[]) =>
    once(`clear:${place}`, async () => {
      const { cleared, error } = await dispatch(
        clearOutPlace({ uid, place, ids }),
      ).unwrap();
      if (cleared.length > 0) {
        addUndoToast(
          `Cleared out the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`,
          `${cleared.length} ${cleared.length === 1 ? 'container' : 'containers'}`,
          () => undoClear(cleared),
        );
      }
      return { count: cleared.length, error };
    });

  /** A cleared-out container back in stock as it was, for a clear-out that took one by mistake. */
  const putBack = (container: Container) =>
    once(container.id, async () => {
      const last = container.history.at(-1);
      if (last?.kind !== 'CLEAR') {
        throw new Error('That has changed since, so it could not be undone.');
      }
      if (isReady && isContainerListFull(inStockCount)) {
        throw new Error(
          `You have ${SOFT_MAX_CONTAINERS} containers in stock. Finish or delete one to put this back.`,
        );
      }
      await dispatch(
        undoContainerEnd({ uid, id: container.id, at: last.at }),
      ).unwrap();
      addToast({
        title: `Put ${container.title} back in the ${CONTAINER_PLACE_LABELS[container.place].toLowerCase()}`,
        type: 'success',
      });
      return true;
    });

  return {
    isReady,
    loadError,
    putAway,
    undoSaved,
    eat,
    toss,
    move,
    changeEatBy,
    correctCount,
    remove,
    clearOut,
    putBack,
  };
}
