import { Badge, Button, Tooltip } from '@moondreamsdev/dreamer-ui/components';
import {
  EyeClosed,
  EyeOpened,
  InfoCircled,
  Trash,
} from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import type { Item } from '../types';
import { getWasRecentlyRevealed } from '../utils/itemHelpers';

interface ItemCardProps {
  item: Item;
  currentUserId?: string;
  isAuthorHidden?: boolean;
  onDelete?: (itemId: string) => void | Promise<void>;
  onToggleVisibility?: (itemId: string) => void | Promise<void>;
}

function ItemCard({
  item,
  currentUserId,
  isAuthorHidden = false,
  onDelete,
  onToggleVisibility,
}: ItemCardProps) {
  const { confirm } = useActionModal();
  const isOwnItem = item.authorId === currentUserId;
  const shouldMaskContent = !item.isRevealed && !isOwnItem;
  const shouldHideOwnContent = !item.isRevealed && isOwnItem && isAuthorHidden;
  const shouldDisplayContent =
    item.isRevealed || (isOwnItem && !shouldHideOwnContent);
  const hasRecentReveal = getWasRecentlyRevealed(item);

  const handleDelete = async () => {
    if (onDelete) {
      const confirmed = await confirm({
        title: 'Delete item',
        message:
          'Are you sure you want to delete this item? This action cannot be undone.',
        destructive: true,
      });

      if (confirmed) {
        await onDelete(item.id);
      }
    }
  };

  const handleToggleVisibility = async () => {
    if (onToggleVisibility) {
      await onToggleVisibility(item.id);
    }
  };

  const getInfoMessage = () => (
    <div className='text-left text-xs'>
      <span>Created: {new Date(item.createdAt).toLocaleString()}</span>
      {/* <br />
      <span>Last edited: {new Date(item.lastEditedAt).toLocaleString()}</span> */}
    </div>
  );

  return (
    <div
      className={join(
        'border-border bg-card/80 rounded-2xl border p-3 shadow-sm',
        shouldMaskContent || shouldHideOwnContent
          ? 'border-muted bg-muted/30 text-muted-foreground'
          : 'bg-card/90 text-foreground',
      )}
    >
      <div className='relative mb-2 flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-[10px] font-medium tracking-[0.14em] uppercase'>
          {isOwnItem ? 'You' : 'Partner'}
        </span>

        <div className='flex items-center gap-2'>
          {isOwnItem && !item.isRevealed ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-8 w-8 p-0'
              aria-label={
                shouldHideOwnContent
                  ? 'Show hidden item'
                  : 'Hide item from view'
              }
              onClick={handleToggleVisibility}
            >
              {shouldHideOwnContent ? (
                <EyeClosed className='h-4 w-4' />
              ) : (
                <EyeOpened className='h-4 w-4' />
              )}
            </Button>
          ) : null}

          {isOwnItem && onDelete ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-8 w-8 p-0'
              aria-label={`Delete item ${item.id}`}
              onClick={handleDelete}
              disabled={shouldHideOwnContent}
            >
              <Trash className='h-4 w-4' />
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <p className='text-sm leading-6'>
          {shouldDisplayContent
            ? item.content
            : shouldMaskContent
              ? 'Hidden item from partner'
              : 'Hidden item from you'}
        </p>

        <div className='mt-3 flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Tooltip
              message={getInfoMessage()}
              placement='right'
              disabled={!shouldDisplayContent}
            >
              <Button
                variant='base'
                size='icon'
                aria-label='Item details'
                className='pl-0!'
                disabled={!shouldDisplayContent}
              >
                <InfoCircled className='h-4 w-4' />
              </Button>
            </Tooltip>
            {!shouldHideOwnContent && isOwnItem && !item.isRevealed && (
              <span className='block text-xs'>
                Only visible to you. Your partner cannot see this item.
              </span>
            )}
          </div>

          {hasRecentReveal ? (
            <Badge
              variant='muted'
              className='border-violet-400/60 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-violet-700 uppercase dark:text-violet-200'
            >
              Recently revealed
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ItemCard;
