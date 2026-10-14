import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  changeContainerEatBy,
  correctContainerCount,
  eatContainer,
  moveContainer,
  removeContainer,
  tossContainer,
  undoContainerBatch,
  undoContainerEnd,
  writeContainers,
} from '@apps/pinch/store/actions/containerActions';
import {
  selectContainersLoadError,
  selectIsContainersReady,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  buildContainer,
  getNewContainersProblem,
  getSavedText,
  type NewContainerInput,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const UNDO_TOAST_MS = 6000;
const PUT_AWAY_KEY = 'put-away';

const inFlight = new Set<string>();

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
  const { addToast } = useToast();
  const isReady = useAppSelector(selectIsContainersReady);
  const loadError = useAppSelector(selectContainersLoadError);
  const inStockCount = useAppSelector(
    (state) => state.pinch.containers.items.length,
  );

  const showUndoFailed = (description: string) =>
    addToast({ title: "Couldn't undo that", description, type: 'error' });

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

  const putAway = async (inputs: Omit<NewContainerInput, 'id'>[]) => {
    const problem = getProblem(inputs);
    if (problem !== null) throw new Error(problem);

    const created = await once(PUT_AWAY_KEY, async () => {
      const now = Date.now();
      const containers = inputs.map((input) =>
        buildContainer({ ...input, id: generateUuid() }, now),
      );
      dispatch(writeContainers({ uid, containers }))
        .unwrap()
        .catch((error) =>
          addToast({
            title: "That didn't save",
            description: getErrorMessage(
              error,
              `${containers[0].title} was taken off your list.`,
            ),
            type: 'error',
          }),
        );
      return containers;
    });
    if (created === undefined) return [];

    addToast({
      title: getSavedText(created),
      description: navigator.onLine
        ? created[0].title
        : `${created[0].title} · Saved on this phone, it will sync when you're online`,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => void undoPutAway(created.map(({ id }) => id)),
      },
    });
    return created;
  };

  const eat = (container: Container, count: number | 'ALL') =>
    once(container.id, async () => {
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
    });

  const toss = (container: Container) =>
    once(container.id, async () => {
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

  return {
    isReady,
    loadError,
    putAway,
    eat,
    toss,
    move,
    changeEatBy,
    correctCount,
    remove,
  };
}
