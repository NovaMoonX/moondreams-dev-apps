import { Button } from '@moondreamsdev/dreamer-ui/components';
import { EyeClosed, EyeOpened, Trash } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { Item } from '../types';

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
  const isOwnItem = item.authorId === currentUserId;
  const shouldMaskContent = !item.isRevealed && !isOwnItem;
  const shouldHideOwnContent = !item.isRevealed && isOwnItem && isAuthorHidden;
  const shouldDisplayContent = item.isRevealed || (isOwnItem && !shouldHideOwnContent);

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(item.id);
    }
  };

  const handleToggleVisibility = async () => {
    if (onToggleVisibility) {
      await onToggleVisibility(item.id);
    }
  };

  return (
    <div
      className={join(
        'border-border bg-card/80 rounded-2xl border p-3 shadow-sm',
        shouldMaskContent || shouldHideOwnContent
          ? 'border-muted bg-muted/30 text-muted-foreground'
          : 'bg-card/90 text-foreground',
      )}
    >
      <div className='mb-2 flex items-center justify-between gap-3'>
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
                shouldHideOwnContent ? 'Show hidden item' : 'Hide item from view'
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
            >
              <Trash className='h-4 w-4' />
            </Button>
          ) : null}
        </div>
      </div>

      <p className='text-sm leading-6'>
        {shouldDisplayContent ? (
          item.content
        ) : shouldMaskContent ? (
          'Hidden item from partner'
        ) : (
          'Hidden item from you'
        )}
      </p>
    </div>
  );
}

export default ItemCard;
