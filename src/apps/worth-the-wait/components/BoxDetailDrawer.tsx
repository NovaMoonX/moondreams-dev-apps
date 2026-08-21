import { useAuth } from '@hooks/useAuth';
import {
  Badge,
  Button,
  Disclosure,
  Drawer,
} from '@moondreamsdev/dreamer-ui/components';
import { useMemo, useState } from 'react';

import AppToggle from '@/components/AppToggle';
import { CheckCircled, DeepRing } from '@moondreamsdev/dreamer-ui/symbols';
import { useBoxContext } from '../context/boxContext';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import { useItems } from '../hooks/useItems';
import { getWasRecentlyRevealed } from '../utils/itemHelpers';
import ItemCard from './ItemCard';
import ItemForm from './ItemForm';
import RevealAction from './RevealAction';

interface BoxDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function BoxDetailDrawer({ isOpen, onClose }: BoxDetailDrawerProps) {
  const { user } = useAuth();
  const { box, spaceId } = useBoxContext();
  const { space, itemsDisclosureOpen, setItemsDisclosureOpen } =
    useWorthTheWait();
  const { items, loading, addItem, deleteItem } = useItems(spaceId, box.id);
  const [visibleItemIds, setVisibleItemIds] = useState(new Set<string>());
  const [showRecentlyRevealedItems, setShowRecentlyRevealedItems] =
    useState(itemsDisclosureOpen);

  const partnerUid = useMemo(() => {
    if (!user || !space) {
      return null;
    }

    return space.members.find((memberUid) => memberUid !== user.uid) ?? null;
  }, [space, user]);

  const currentUserRequest = useMemo(
    () =>
      box.revealRequestedBy.find((request) => request.userId === user?.uid) ??
      null,
    [box.revealRequestedBy, user?.uid],
  );

  const partnerRequest = useMemo(
    () =>
      partnerUid == null
        ? null
        : (box.revealRequestedBy.find(
            (request) => request.userId === partnerUid,
          ) ?? null),
    [box.revealRequestedBy, partnerUid],
  );

  const mutualMethod =
    currentUserRequest &&
    partnerRequest &&
    currentUserRequest.method === partnerRequest.method
      ? currentUserRequest.method
      : null;

  const hasUserRequest = Boolean(currentUserRequest);
  const hasPartnerRequest = Boolean(partnerRequest);
  const hasMutualRequest = Boolean(mutualMethod);

  const sortedItems = useMemo(
    () => [...items].sort((left, right) => left.createdAt - right.createdAt),
    [items],
  );

  const revealedItems = useMemo(
    () => items.filter((item) => item.isRevealed === true),
    [items],
  );
  const areUnrevealedItems = revealedItems.length < items.length;

  const filteredItems = useMemo(() => {
    if (showRecentlyRevealedItems) {
      return sortedItems.filter((item) => item.isRevealed);
    }

    return sortedItems;
  }, [showRecentlyRevealedItems, sortedItems]);

  const areRecentlyRevealedItems = useMemo(
    () => sortedItems.some((item) => getWasRecentlyRevealed(item)),
    [sortedItems],
  );

  const authorHasUnrevealedVisibleItems = useMemo(
    () =>
      filteredItems.some(
        (item) => item.authorId === user?.uid && item.isRevealed === false,
      ),
    [filteredItems, user?.uid],
  );

  const handleToggleAllItemsVisibility = () => {
    setVisibleItemIds((current) => {
      if (current.size === 0) {
        return new Set(items.map((item) => item.id));
      } else {
        return new Set();
      }
    });
  };

  const handleToggleItemVisibility = async (itemId: string) => {
    setVisibleItemIds((current) => {
      const newSet = new Set(current);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        box ? (
          <div className='flex items-center gap-3 pb-2'>
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
          <div className='space-y-3'>
            <p className='text-muted-foreground text-sm leading-6'>
              {box.description}
            </p>

            <Disclosure
              label={
                <div className='flex w-full items-center justify-between gap-3'>
                  <div className='leading-tight'>
                    Request reveal
                    {!areUnrevealedItems && (
                      <>
                        <br />
                        <span className='text-muted-foreground text-xs'>
                          There are no unrevealed items
                        </span>
                      </>
                    )}
                  </div>
                  {hasMutualRequest ? (
                    <CheckCircled className='h-5 w-5 text-emerald-500' />
                  ) : hasPartnerRequest ? (
                    <DeepRing className='h-5 w-5 text-emerald-500' />
                  ) : hasUserRequest ? (
                    <Badge variant='success' aspect='square' size='md' />
                  ) : null}
                </div>
              }
              className='border-border rounded-2xl border bg-slate-950/10'
              buttonClassName='w-full justify-between rounded-2xl px-4 py-3 text-left'
              disabled={!areUnrevealedItems}
            >
              <div className='px-4 pt-2 pb-4'>
                <RevealAction />
              </div>
            </Disclosure>

            <Disclosure
              isOpen={itemsDisclosureOpen}
              onToggle={(open) => setItemsDisclosureOpen(open)}
              label={
                <div className='flex w-full items-center justify-between gap-3'>
                  <span>Items</span>
                  <div className='flex items-center gap-2'>
                    {revealedItems.length > 0 && (
                      <Badge
                        variant='base'
                        className='bg-violet-300 text-violet-950 dark:bg-violet-900 dark:text-violet-100'
                      >
                        {revealedItems.length}
                      </Badge>
                    )}
                    <Badge variant='muted'>
                      {sortedItems.length - revealedItems.length}
                    </Badge>
                  </div>
                </div>
              }
              className='border-border rounded-2xl border bg-slate-950/10'
              buttonClassName='w-full justify-between rounded-2xl px-4 py-3 text-left'
            >
              <div className='space-y-3 px-4 pt-3 pb-4'>
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-muted-foreground text-xs tracking-[0.14em] uppercase'>
                    {filteredItems.length} item
                    {filteredItems.length === 1 ? '' : 's'}
                  </span>

                  <div className='flex items-center gap-3'>
                    {areRecentlyRevealedItems && (
                      <div className='ml-2 flex items-center gap-2'>
                        <span className='text-xs'>
                          {showRecentlyRevealedItems
                            ? 'Viewing recently revealed'
                            : 'Viewing all items'}
                        </span>
                        <AppToggle
                          size='sm'
                          checked={showRecentlyRevealedItems}
                          onCheckedChange={() => {
                            setShowRecentlyRevealedItems((current) => !current);
                            setVisibleItemIds(new Set()); // Reset visible items when toggling
                          }}
                        />
                      </div>
                    )}
                    {filteredItems.length > 0 &&
                      authorHasUnrevealedVisibleItems && (
                        <Button
                          variant={'secondary'}
                          size='sm'
                          onClick={handleToggleAllItemsVisibility}
                        >
                          {visibleItemIds.size === 0
                            ? 'Show my items'
                            : 'Hide my items'}
                        </Button>
                      )}
                  </div>
                </div>

                {loading ? (
                  <p className='text-muted-foreground text-sm'>
                    Loading items...
                  </p>
                ) : filteredItems.length === 0 ? (
                  <div className='border-border bg-muted/30 text-muted-foreground rounded-2xl border border-dashed p-4 text-center text-sm'>
                    No items yet. Share your first thought with your partner.
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      currentUserId={user?.uid}
                      isAuthorHidden={
                        item.authorId === user?.uid &&
                        !visibleItemIds.has(item.id)
                      }
                      onDelete={deleteItem}
                      onToggleVisibility={handleToggleItemVisibility}
                    />
                  ))
                )}

                <div className='flex justify-center py-2'>
                  <Button
                    variant='link'
                    onClick={() => setItemsDisclosureOpen(false)}
                    className='text-sm'
                  >
                    Close
                  </Button>
                </div>
              </div>
            </Disclosure>
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
