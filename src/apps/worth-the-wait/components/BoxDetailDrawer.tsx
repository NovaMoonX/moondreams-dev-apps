import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useAuth } from '@hooks/useAuth';
import { useMemo, useState } from 'react';

import { useItems } from '../hooks/useItems';
import type { Box } from '../types';
import ItemCard from './ItemCard';
import ItemForm from './ItemForm';

interface BoxDetailDrawerProps {
  box: Box | null;
  spaceId: string;
  onClose: () => void;
}

function BoxDetailDrawer({ box, spaceId, onClose }: BoxDetailDrawerProps) {
  const { user } = useAuth();
  const { items, loading, addItem, deleteItem } = useItems(spaceId, box?.id ?? '');
  const [hideOwnHiddenNotes, setHideOwnHiddenNotes] = useState(false);
  const [hiddenItemIds, setHiddenItemIds] = useState<Record<string, boolean>>({});

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
      isOpen={Boolean(box)}
      onClose={onClose}
      title={
        box ? (
          <div className='flex items-center gap-3'>
            <span className='bg-muted flex h-10 w-10 items-center justify-center rounded-xl text-xl'>
              {box.emoji}
            </span>
            <div>
              <p className='text-foreground text-lg font-semibold'>{box.name}</p>
              <p className='text-muted-foreground text-xs uppercase tracking-[0.14em]'>
                {box.isDefault ? 'Starter box' : 'Custom box'}
              </p>
            </div>
          </div>
        ) : null
      }
      showCloseButton
      className='max-w-xl'
      enableDragGestures
    >
      {box ? (
        <div className='space-y-5'>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm leading-6'>
              {box.description}
            </p>

            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground text-xs uppercase tracking-[0.14em]'>
                {sortedItems.length} note{sortedItems.length === 1 ? '' : 's'}
              </span>

              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => setHideOwnHiddenNotes((current) => !current)}
              >
                {hideOwnHiddenNotes ? 'Show hidden notes' : 'Hide my notes'}
              </Button>
            </div>
          </div>

          <div className='space-y-3'>
            {loading ? (
              <p className='text-muted-foreground text-sm'>Loading notes...</p>
            ) : sortedItems.length === 0 ? (
              <div className='border-border bg-muted/30 rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground'>
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
      ) : null}
    </Drawer>
  );
}

export default BoxDetailDrawer;
