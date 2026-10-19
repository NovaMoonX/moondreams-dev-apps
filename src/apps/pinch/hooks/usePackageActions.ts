import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  changePackagesInPlace,
  consumePackage,
  editPackage,
  movePackage,
  removePackage,
  takeFromPackages,
  tossPackage,
  undoPackageAdd,
  undoPackageChanges,
  undoPackageEnd,
  writePackages,
  type ChangedPackage,
} from '@apps/pinch/store/actions/packageActions';
import {
  selectIsPackagesReady,
  selectPackagesLoadError,
} from '@apps/pinch/store/selectors';
import type { Package, PackagePlace } from '@apps/pinch/types';
import { formatSize } from '@apps/pinch/utils/productFormat';
import {
  buildPackage,
  getNewPackagesProblem,
  getPackageBulkToast,
  getPackageSkippedText,
  getPackageUndoText,
  getPlaceText,
  type NewPackageInput,
  type PackageBulkAction,
  type PackageEdit,
  type PackageTake,
} from '@apps/pinch/utils/packages';

const UNDO_TOAST_MS = 6000;

const inFlight = new Set<string>();
const undone = new Set<string>();

/** Ignores a second tap on the same package while its first change is still being written. */
const once = async <T>(key: string, run: () => Promise<T>) => {
  if (inFlight.has(key)) return undefined;

  inFlight.add(key);
  try {
    return await run();
  } finally {
    inFlight.delete(key);
  }
};

interface AddOptions {
  /** Runs once the write has settled, never when it was refused (that raises the error toast). */
  onWritten?: () => void;
}

export function usePackageActions(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast, removeToast } = useToast();
  const isReady = useAppSelector(selectIsPackagesReady);
  const loadError = useAppSelector(selectPackagesLoadError);
  const inStockCount = useAppSelector(
    (state) => state.pinch.packages.items.length,
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

  const undoChanges = async (changed: ChangedPackage[]) => {
    try {
      const { restored, error } = await dispatch(
        undoPackageChanges({ uid, changed }),
      ).unwrap();
      if (restored === 0) {
        showUndoFailed('They changed since, so they were left as they are.');
        return 0;
      }
      if (restored < changed.length || error !== null) {
        addToast({
          title: getPackageUndoText(restored, changed.length),
          description: error ?? undefined,
          type: 'info',
        });
      }
      return restored;
    } catch (error) {
      showUndoFailed(getErrorMessage(error, "Couldn't undo that."));
      return 0;
    }
  };

  const getProblem = (inputs: Omit<NewPackageInput, 'id'>[]) => {
    if (loadError !== null) {
      return "Your pantry couldn't load, so adding is paused.";
    }
    if (!isReady) {
      return 'Your pantry is still loading. Try again in a moment.';
    }
    return getNewPackagesProblem(inputs, inStockCount);
  };

  /** Writes new packages in one batch and resolves to them once the write is queued: offline it still lands locally and syncs later. */
  const add = (
    inputs: Omit<NewPackageInput, 'id'>[],
    { onWritten }: AddOptions = {},
  ) => {
    const problem = getProblem(inputs);
    if (problem !== null) throw new Error(problem);

    const now = Date.now();
    const created = inputs.map((input) =>
      buildPackage({ ...input, id: generateUuid() }, now),
    );
    dispatch(writePackages({ uid, packages: created }))
      .unwrap()
      .then(
        () => onWritten?.(),
        (error: string) =>
          addToast({
            title: "That didn't save",
            description: error,
            type: 'error',
          }),
      );
    return created;
  };

  const undoAdd = (id: string) =>
    once(`add:${id}`, () => dispatch(undoPackageAdd({ uid, id })).unwrap());

  const undoEnd = async (id: string, at: number) => {
    try {
      await dispatch(undoPackageEnd({ uid, id, at })).unwrap();
    } catch (error) {
      showUndoFailed(getErrorMessage(error, 'You can change it from Pantry.'));
    }
  };

  const consume = (pkg: Package, amount: number | 'ALL', name: string) =>
    once(pkg.id, async () => {
      const { at, isFinished, amountLeft } = await dispatch(
        consumePackage({ uid, id: pkg.id, amount }),
      ).unwrap();
      const used = amount === 'ALL' ? pkg.amount : amount;
      addUndoToast(
        isFinished
          ? `Used up ${name}`
          : `Used ${formatSize(used, pkg.unit)} of ${name}`,
        isFinished || amountLeft === null
          ? undefined
          : `${formatSize(amountLeft, pkg.unit)} left`,
        () => undoEnd(pkg.id, at),
      );
      return isFinished;
    });

  const toss = (pkg: Package, name: string) =>
    once(pkg.id, async () => {
      const { at } = await dispatch(tossPackage({ uid, id: pkg.id })).unwrap();
      addUndoToast(`Tossed ${name}`, undefined, () => undoEnd(pkg.id, at));
      return true;
    });

  const move = (
    pkg: Package,
    to: PackagePlace,
    name: string,
    expiresAt?: number | null,
  ) =>
    once(pkg.id, async () => {
      const { at, before } = await dispatch(
        movePackage({ uid, id: pkg.id, to, expiresAt }),
      ).unwrap();
      addUndoToast(`Moved ${name} to ${getPlaceText(to)}`, undefined, () =>
        undoChanges([{ id: pkg.id, at, before }]).then(() => undefined),
      );
      return true;
    });

  const edit = (pkg: Package, change: PackageEdit) =>
    once(pkg.id, () =>
      dispatch(editPackage({ uid, id: pkg.id, edit: change })).unwrap(),
    );

  const remove = (pkg: Package) =>
    once(pkg.id, () => dispatch(removePackage({ uid, id: pkg.id })).unwrap());

  /** One act on many packages: resolves to how many it really changed, a sentence when it stopped partway, and one on why it left some alone. */
  const changeInPlace = (
    action: PackageBulkAction,
    ids: string[],
    getNames: (changedIds: string[]) => string | null,
  ) =>
    once(`bulk:${action.kind}`, async () => {
      const { changed, skipped, error } = await dispatch(
        changePackagesInPlace({ uid, ids, action }),
      ).unwrap();
      const skippedText = getPackageSkippedText(skipped);
      if (changed.length === 0) return { count: 0, error, skippedText };

      const { title, description } = getPackageBulkToast({
        action,
        requested: ids.length,
        changed: changed.length,
        skipped,
        names: getNames(changed.map((entry) => entry.id)),
      });
      addUndoToast(title, description, () =>
        undoChanges(changed).then(() => undefined),
      );
      return { count: changed.length, error, skippedText };
    });

  /** What cooking takes out: resolves to what was queued, for the card that says so and holds the Undo, and calls `onRefused` if the server turns the batch down later. */
  const takeOut = (takes: PackageTake[], onRefused: () => void) =>
    once(`take:${takes.map((take) => take.packageId).join(',')}`, () =>
      dispatch(
        takeFromPackages({
          uid,
          takes,
          onRefused: (message) => {
            onRefused();
            addToast({
              title: "That didn't save",
              description: message,
              type: 'error',
            });
          },
        }),
      ).unwrap(),
    );

  return {
    isReady,
    loadError,
    add,
    undoAdd,
    consume,
    toss,
    move,
    edit,
    remove,
    changeInPlace,
    takeOut,
    undoChanges,
  };
}
