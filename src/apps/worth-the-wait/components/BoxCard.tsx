import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import type { Box } from '../types';
import { useAuth } from '@/hooks/useAuth';
import { getFriendlyRevealMethod } from '../utils/boxHelpers';

interface BoxCardProps {
  box: Box;
  onDelete?: (boxId: string) => void | Promise<void>;
}

function BoxCard({ box, onDelete }: BoxCardProps) {
  const { user } = useAuth();
  const { alert, confirm } = useActionModal();
  const revealCount = box.revealHistory.length;

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

  const numActiveRevealRequest = box.revealRequestedBy.length;
  const isActiveRevealRequest = numActiveRevealRequest > 0;
  const getRevealRequestText = () => {
    if (numActiveRevealRequest === 0) {
      return
    }

    if (numActiveRevealRequest > 1) {
      return `${numActiveRevealRequest} pending reveal requests`;
    }

    const revealRequest = box.revealRequestedBy[0];

    if (revealRequest?.userId === user?.uid) {
      return `You requested a ${getFriendlyRevealMethod(revealRequest.method)}`;
    }

    return `A ${getFriendlyRevealMethod(revealRequest.method)} was requested`;
  }
  return (
    <article className='border-border bg-card/80 flex h-full flex-col rounded-2xl border p-4 shadow-sm'>
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

        {onDelete && !box.isDefault ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={handleConfirmDelete}
            className='shrink-0'
          >
            Delete
          </Button>
        ) : null}
      </div>

      <p className='text-muted-foreground flex-1 text-sm leading-6'>
        {box.description}
      </p>

      <div
        className={join(
          'mt-4 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs',
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
          <span className='rounded-full bg-emerald-400 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-200 px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] uppercase'>
            {getRevealRequestText()}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default BoxCard;
