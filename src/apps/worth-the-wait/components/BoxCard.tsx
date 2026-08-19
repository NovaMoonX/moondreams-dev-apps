import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuFactories,
  Tooltip,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { DotsVertical } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useBoxContext } from '../context/boxContext';
import { useItems } from '../hooks/useItems';
import { getFriendlyRevealMethod } from '../utils/boxHelpers';
import BoxDetailDrawer from './BoxDetailDrawer';
import ManageBoxModal from './ManageBoxModal';

function BoxCard() {
  const { user } = useAuth();
  const { box, spaceId, onDelete, onEdit, onOpen } = useBoxContext();
  const { alert, confirm } = useActionModal();
  const { option, separator } = DropdownMenuFactories;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isManagedActionInProgress = useRef(false);

  const revealCount = box.revealHistory.length;
  const canManageCustomBox = !box.isDefault && user?.uid === box.createdBy;
  const { items } = useItems(spaceId, box.id);
  const itemCount = items.length;

  const handleConfirmDelete = async () => {
    if (user?.uid !== box.createdBy) {
      alert({
        title: 'Cannot delete box',
        message: 'Only the person who created this box can delete it.',
      });
      return;
    }

    const confirmed = await confirm({
      title: 'Delete box',
      message:
        'Are you sure you want to delete this box? This action cannot be undone.',
      destructive: true,
    });

    if (confirmed && onDelete) {
      await onDelete(box.id);
    }
  };

  const menuItems = useMemo(
    () => [
      option({ label: 'Edit', value: 'edit' }),
      separator(),
      option({ label: 'Delete', value: 'delete' }),
    ],
    [option, separator],
  );

  const handleMenuSelect = async (value: string) => {
    if (value === 'edit') {
      if (user?.uid !== box.createdBy) {
        isManagedActionInProgress.current = false;
        return;
      }

      setIsEditModalOpen(true);
      return;
    }

    if (value === 'delete') {
      await handleConfirmDelete();
      isManagedActionInProgress.current = false;
    }
  };

  const numActiveRevealRequest = box.revealRequestedBy.length;
  const isActiveRevealRequest = numActiveRevealRequest > 0;
  const getRevealRequestText = () => {
    if (numActiveRevealRequest === 0) {
      return '';
    }

    if (numActiveRevealRequest > 1) {
      return `${numActiveRevealRequest} pending reveal requests`;
    }

    const revealRequest = box.revealRequestedBy[0];

    if (revealRequest?.userId === user?.uid) {
      return `You requested a ${getFriendlyRevealMethod(revealRequest.method)}`;
    }

    return `A ${getFriendlyRevealMethod(revealRequest.method)} was requested`;
  };

  return (
    <>
      <div
        tabIndex={0}
        role='button'
        onClick={() => {
          if (isManagedActionInProgress.current) {
            return;
          }

          onOpen?.(box.id);
          setIsDrawerOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (isManagedActionInProgress.current) {
              return;
            }
            onOpen?.(box.id);
            setIsDrawerOpen(true);
          }
        }}
        className='w-full'
        aria-label={`Open box ${box.name}`}
      >
        <div className='border-border bg-card/80 hover:border-ring/60 flex h-full cursor-pointer flex-col rounded-2xl border p-4 shadow-sm transition'>
          <div className='mb-4 flex items-start justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <div className='bg-muted flex h-12 w-12 items-center justify-center rounded-xl text-2xl'>
                {box.emoji}
              </div>
              <div>
                <h3 className='text-foreground text-lg font-semibold'>
                  {box.name}
                </h3>
                <p className='text-muted-foreground text-xs tracking-[0.16em] uppercase'>
                  {box.isDefault ? 'Starter box' : 'Custom'}
                </p>
              </div>
            </div>

            <div className='flex items-center gap-2'>
              {itemCount > 0 && (
                <Badge variant='muted' className='text-base! font-bold'>
                  {itemCount}
                </Badge>
              )}
              {canManageCustomBox ? (
                <DropdownMenu
                  items={menuItems}
                  onItemSelect={(value) => {
                    isManagedActionInProgress.current = true;
                    void handleMenuSelect(value);
                  }}
                  placement='top'
                  alignment='end'
                  offset={8}
                  trigger={
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className='h-9 w-9 shrink-0 p-0'
                      aria-label={`Open actions for ${box.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <DotsVertical className='h-4 w-4' />
                    </Button>
                  }
                />
              ) : !box.isDefault ? (
                <Tooltip
                  message='Only the person who created this box can edit or delete it.'
                  placement='left'
                >
                  <span>
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className='h-9 w-9 shrink-0 p-0'
                      aria-label={`Open actions for ${box.name}`}
                      disabled={true}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DotsVertical className='h-4 w-4' />
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <p className='text-muted-foreground flex-1 text-sm leading-6'>
            {box.description}
          </p>

          <div
            className={join(
              'mt-3 flex flex-col items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs sm:flex-row',
              isActiveRevealRequest
                ? 'border-emerald-400 dark:border-emerald-700'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            <span>
              {revealCount > 0
                ? `${revealCount} reveal${revealCount === 1 ? '' : 's'}`
                : 'No reveals yet'}
            </span>
            {isActiveRevealRequest ? (
              <span className='rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-emerald-950 uppercase dark:bg-emerald-900 dark:text-emerald-200'>
                {getRevealRequestText()}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <BoxDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {canManageCustomBox ? (
        <ManageBoxModal
          key={`edit-box-modal-${isEditModalOpen}`}
          isOpen={isEditModalOpen}
          title='Edit box'
          submitLabel='Save changes'
          initialValues={{
            name: box.name,
            emoji: box.emoji,
            description: box.description,
          }}
          onClose={() => {
            setIsEditModalOpen(false);
            isManagedActionInProgress.current = false;
          }}
          onCreate={async (draft) => {
            if (onEdit) {
              await onEdit(box.id, draft);
            }
          }}
        />
      ) : null}
    </>
  );
}

export default BoxCard;
