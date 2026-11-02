import { useState, type ReactNode } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { store } from '@/store';
import DeleteThingConfirm, {
  type DeleteChoice,
  type DeleteQuestion,
} from '@apps/going-once/components/things/DeleteThingConfirm';
import { deleteItem } from '@apps/going-once/store/actions/itemActions';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import { selectItems } from '@apps/going-once/store/selectors';
import type { Item } from '@apps/going-once/types';
import { getItemName } from '@apps/going-once/utils/listing';
import { getStatusSummary } from '@apps/going-once/utils/statusSummary';

const isRefused = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'permission-denied';

/**
 * Asks before deleting a thing and deletes it in the background; `deleteThing` resolves true once it is deleted.
 * `onTakeOff` runs when the person takes it off the list instead, so the caller can show its own Undo; without it the thing is taken off here.
 * `dialog` is the confirm and must be rendered by the caller.
 */
export function useDeleteThing(
  saleId: string,
  uid: string,
  onTakeOff: ((item: Item) => void) | null = null,
): { deleteThing: (item: Item) => Promise<boolean>; dialog: ReactNode } {
  const { addToast } = useToast();
  const [asking, setAsking] = useState<DeleteQuestion | null>(null);

  const ask = (item: Item) =>
    new Promise<DeleteChoice>((resolve) => {
      const collectedCents = getStatusSummary(
        selectItems(store.getState(), saleId),
      ).SOLD.collectedCents;
      setAsking({
        item,
        collectedCents,
        settle: (choice) => {
          setAsking(null);
          resolve(choice);
        },
      });
    });

  const deleteThing = async (item: Item): Promise<boolean> => {
    const name = getItemName(item);
    const choice = await ask(item);
    if (choice === 'TAKE_OFF') {
      if (onTakeOff !== null) {
        onTakeOff(item);
        return false;
      }
      const result = await changeStatus(saleId, item.id, uid, {
        kind: 'TAKE_OFF',
        undoesAt: null,
      });
      if (!result.ok)
        addToast({
          title: `${name} wasn't taken off the list`,
          description: result.message,
          type: 'error',
        });
      return false;
    }
    if (choice !== 'DELETE') return false;
    deleteItem(saleId, item, (error) =>
      addToast({
        title: `${name} wasn't deleted`,
        description: isRefused(error)
          ? 'Only the seller can delete it now. It is back on your list.'
          : 'Something went wrong. It is back on your list; try again.',
        type: 'error',
      }),
    );
    return true;
  };

  return { deleteThing, dialog: <DeleteThingConfirm question={asking} /> };
}
