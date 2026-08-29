import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuFactories,
  Tooltip,
} from '@moondreamsdev/dreamer-ui/components';
import {
  DotsVertical,
  EyeClosed,
  EyeOpened,
  InfoCircled,
} from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatDateTime } from '@/utils';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import type { Item } from '../types';
import {
  getBoxItemCardElementId,
  getWasRecentlyRevealed,
} from '../utils/itemHelpers';

interface ItemCardProps {
  itemPos: number;
  item: Item;
  currentUserId?: string;
  isAuthorHidden?: boolean;
  isEditing: boolean;
  onDelete?: (itemId: string) => void | Promise<void>;
  onEdit?: (item: Item) => boolean | Promise<boolean>;
  onReveal?: (itemId: string) => void | Promise<void>;
  onToggleVisibility?: (itemId: string) => void | Promise<void>;
  onFocusTextarea?: () => void;
}

function ItemCard({
  itemPos,
  item,
  currentUserId,
  isAuthorHidden = false,
  isEditing,
  onDelete,
  onEdit,
  onReveal,
  onToggleVisibility,
  onFocusTextarea,
}: ItemCardProps) {
  const { confirm } = useActionModal();
  const { option, separator } = DropdownMenuFactories;

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

  const handleEdit = async () => {
    if (onEdit) {
      const willEdit = await onEdit(item);
      if (willEdit) {
        onToggleVisibility?.(item.id);
      }
    }
  };

  const handleReveal = async () => {
    if (!onReveal || item.isRevealed) {
      return;
    }

    const confirmed = await confirm({
      title: 'Reveal item',
      message: 'This will make the item visible to your partner. Continue?',
    });

    if (confirmed) {
      await onReveal(item.id);
    }
  };

  const handleToggleVisibility = async () => {
    if (onToggleVisibility) {
      await onToggleVisibility(item.id);
    }
  };

  const menuItems = [
    option({
      label: 'Edit item',
      value: 'edit',
      description: 'Replace what you wrote with a new message.',
      disabled: !onEdit || isEditing,
    }),
    option({
      label: 'Reveal item',
      value: 'reveal',
      disabled: item.isRevealed,
      description: item.isRevealed
        ? 'This item is already revealed.'
        : 'Make this item visible to your partner.',
    }),
    separator(),
    option({ label: 'Delete item', value: 'delete' }),
  ];

  const handleMenuSelect = async (value: string) => {
    if (value === 'edit') {
      await handleEdit();
      return;
    }

    if (value === 'reveal') {
      await handleReveal();
      return;
    }

    if (value === 'delete') {
      await handleDelete();
    }
  };

  const getInfoMessage = () => {
    const timestamps = [{ label: 'Created', timestamp: item.createdAt }];

    if (
      item.authorId === currentUserId &&
      item.lastEditedAt &&
      item.lastEditedAt !== item.createdAt
    ) {
      timestamps.push({ label: 'Edited', timestamp: item.lastEditedAt });
    }

    if (item.isRevealed && item.revealedAt) {
      timestamps.push({ label: 'Revealed', timestamp: item.revealedAt });
    }

    return (
      <div className='text-left text-xs'>
        {timestamps.map(({ label, timestamp }) => (
          <div key={label} className='flex justify-between'>
            {label}: {formatDateTime(timestamp)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      id={getBoxItemCardElementId(item.id)}
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
          {isEditing && (
            <Badge variant='muted' role='button' onClick={onFocusTextarea} className='cursor-pointer hover:text-foreground! transition'>
              Editing
            </Badge>
          )}
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

          {isOwnItem && (onDelete || onReveal || onEdit) ? (
            <DropdownMenu
              items={menuItems}
              onItemSelect={async (value) => {
                await handleMenuSelect(value);
              }}
              placement={itemPos === 0 ? 'bottom' : 'top'}
              alignment='end'
              offset={8}
              trigger={
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='h-8 w-8 p-0'
                  aria-label={`Open actions for item ${item.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <DotsVertical className='h-4 w-4' />
                </Button>
              }
            />
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
