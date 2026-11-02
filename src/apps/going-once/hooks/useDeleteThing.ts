import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { deleteItem } from '@apps/going-once/store/actions/itemActions';
import type { Item } from '@apps/going-once/types';
import { getDeleteEffects, getItemName } from '@apps/going-once/utils/listing';

/** Asks before deleting a thing and deletes it; resolves true once it is gone. */
export function useDeleteThing(saleId: string) {
  const { confirm } = useActionModal();
  const { addToast } = useToast();

  return async (item: Item): Promise<boolean> => {
    const name = getItemName(item);
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      message: [...getDeleteEffects(item), "This can't be undone."].join(' '),
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return false;
    try {
      await deleteItem(saleId, item);
      return true;
    } catch {
      addToast({
        title: `${name} wasn't deleted`,
        description: 'Check your connection and try again.',
        type: 'error',
      });
      return false;
    }
  };
}
