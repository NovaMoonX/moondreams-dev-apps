import { useAuth } from '@hooks/useAuth';
import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useMemo, useState } from 'react';

import { useBoxContext } from '../context/boxContext';
import { useItems } from '../hooks/useItems';
import ItemCard from './ItemCard';
import ItemForm from './ItemForm';

interface BoxDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function BoxDetailDrawer({ isOpen, onClose }: BoxDetailDrawerProps) {
  const { user } = useAuth();
  const { box, spaceId } = useBoxContext();
  const { items, loading, addItem, deleteItem } = useItems(spaceId, box.id);
  const [hideOwnHiddenNotes, setHideOwnHiddenNotes] = useState(true);
  const [hiddenItemIds, setHiddenItemIds] = useState<Record<string, boolean>>(
    {},
  );

  const sortedItems = useMemo(
    () => [...items].sort((left, right) => left.createdAt - right.createdAt),
    [items],
  );

  const handleToggleVisibility = async (itemId: string) => {
    setHiddenItemIds((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        box ? (
          <div className='flex items-center gap-3'>
            <span className='bg-muted flex h-10 w-10 items-center justify-center rounded-xl text-xl'>
              {box.emoji}
            </span>
            <div>
              <p className='text-foreground text-lg font-semibold'>
                {box.name}
              </p>
              <p className='text-muted-foreground text-xs tracking-[0.14em] uppercase'>
                {box.isDefault ? 'Starter box' : 'Custom box'}
              </p>
            </div>
          </div>
        ) : null
      }
      showCloseButton
      className='mx-auto max-w-2xl'
      enableDragGestures
    >
      {box ? (
        <div className='space-y-5'>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm leading-6'>
              {box.description}
            </p>

            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground text-xs tracking-[0.14em] uppercase'>
                {sortedItems.length} note{sortedItems.length === 1 ? '' : 's'}
              </span>

              {sortedItems.length > 0 && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setHideOwnHiddenNotes((current) => !current)}
                >
                  {hideOwnHiddenNotes ? 'Show my notes' : 'Hide my notes'}
                </Button>
              )}
            </div>
          </div>

          <div className='space-y-3'>
            {loading ? (
              <p className='text-muted-foreground text-sm'>Loading notes...</p>
            ) : sortedItems.length === 0 ? (
              <div className='border-border bg-muted/30 text-muted-foreground rounded-2xl border border-dashed p-4 text-center text-sm'>
                No notes yet. Share your first thought with your partner.
              </div>
            ) : (
              sortedItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currentUserId={user?.uid}
                  isAuthorHidden={
                    (item.authorId === user?.uid && hideOwnHiddenNotes) ||
                    Boolean(hiddenItemIds[item.id])
                  }
                  onDelete={deleteItem}
                  onToggleVisibility={handleToggleVisibility}
                />
              ))
            )}
          </div>

          <div className='border-border border-t pt-4'>
            <ItemForm
              onSubmit={async (content) => {
                await addItem(content);
              }}
              placeholder='Write a thought, wish, or plan...'
            />
          </div>
        </div>
      ) : loading ? (
        <p className='text-muted-foreground text-sm'>Loading box...</p>
      ) : (
        <p className='text-muted-foreground text-sm'>No box selected.</p>
      )}
    </Drawer>
  );
}

export default BoxDetailDrawer;
