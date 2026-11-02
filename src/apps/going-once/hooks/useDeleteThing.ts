import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { deleteItem } from '@apps/going-once/store/actions/itemActions';
import type { Item } from '@apps/going-once/types';
import { getDeleteEffects, getItemName } from '@apps/going-once/utils/listing';

/** Asks before deleting a thing and deletes it in the background; resolves true once the person has confirmed. */
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
    deleteItem(saleId, item, () =>
      addToast({
        title: `${name} wasn't deleted`,
        description:
          'Only the seller can delete it now. It is back on your list.',
        type: 'error',
      }),
    );
    return true;
  };
}
