import type { ReactNode } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { Archive, Layers, ListChecks, MessageSquarePlus, Receipt } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { getMapNavigationUrl, openMapNavigation } from '@/utils/mapUrlUtils';
import { useHasExpense, useIsNoExpense } from '@apps/waypoint/hooks/useHasExpense';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import type { ExpenseLink, TimelineEvent } from '@apps/waypoint/types';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface PlaceDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageUrl: string | null;
  location: Pick<TimelineEvent, 'locationName' | 'address' | 'latitude' | 'longitude'>;
  linkUrl: string | null;
  onEdit: (() => void) | null;
  archiveLabel?: string | null;
  onArchive?: (() => void) | null;
  stackLabel?: string | null;
  onStack?: (() => void) | null;
  onSuggest?: (() => void) | null;
  /** Offers to link or add an expense while this item has none and nobody marked it as needing none. */
  expenseTarget?: { link: ExpenseLink; getSubject: () => RelatedSubject } | null;
  children: ReactNode;
}

export function PlaceDetailsDrawer({
  isOpen,
  onClose,
  title,
  imageUrl,
  location,
  linkUrl,
  onEdit,
  archiveLabel,
  onArchive,
  stackLabel,
  onStack,
  onSuggest,
  expenseTarget = null,
  children,
}: PlaceDetailsDrawerProps) {
  const { startLinkExpense, startLinkChecklist, canAddExpenses, canManageChecklist } = useRelatedFlow();
  const hasExpense = useHasExpense(expenseTarget?.link.kind ?? 'EVENT', expenseTarget?.link.id ?? '');
  const isNoExpense = useIsNoExpense(expenseTarget?.link.kind ?? 'EVENT', expenseTarget?.link.id ?? '');
  const canLinkExpense = expenseTarget !== null && canAddExpenses && !hasExpense && !isNoExpense;
  const canLinkTodo = expenseTarget !== null && canManageChecklist && expenseTarget.getSubject().tracksTodos;
  const canNavigate = getMapNavigationUrl(location) !== null;
  const hasMoreActions = Boolean(onStack || onArchive || onSuggest || canLinkExpense || canLinkTodo);
  const primaryLabel = canNavigate ? 'Navigate' : linkUrl ? 'Visit site' : onEdit ? 'Modify' : null;

  const getFooter = () => {
    if (primaryLabel === null) {
      return undefined;
    }
    return (
      <div className='flex items-center gap-2'>
        {primaryLabel === 'Navigate' && (
          <Button type='button' size='lg' className='flex-1' onClick={() => openMapNavigation(location)}>
            Navigate
          </Button>
        )}
        {primaryLabel === 'Visit site' && linkUrl && (
          <Button href={linkUrl} target='_blank' rel='noreferrer' size='lg' className='flex-1'>
            Visit site
          </Button>
        )}
        {primaryLabel === 'Modify' && onEdit && (
          <Button type='button' size='lg' className='flex-1' onClick={() => onEdit()}>
            Modify
          </Button>
        )}
        {primaryLabel !== 'Modify' && onEdit && (
          <Button type='button' size='lg' variant='secondary' onClick={() => onEdit()}>
            Modify
          </Button>
        )}
      </div>
    );
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} showCloseButton={true} footer={getFooter()}>
      <div className='space-y-4'>
        {imageUrl && (
          <FallbackImage src={imageUrl} alt='' className='aspect-video max-h-36 w-full rounded-lg object-cover' />
        )}
        <div className='space-y-2'>{children}</div>
        {hasMoreActions && (
          <div className='border-border divide-border divide-y rounded-xl border'>
            {canLinkExpense && (
              <Button
                type='button'
                variant='tertiary'
                className='h-10 w-full justify-start gap-3 px-3 text-sm font-normal'
                onClick={() => {
                  onClose();
                  startLinkExpense(expenseTarget.getSubject());
                }}
              >
                <Receipt className='text-muted-foreground h-4 w-4' />
                Link or add an expense
              </Button>
            )}
            {canLinkTodo && (
              <Button
                type='button'
                variant='tertiary'
                className='h-10 w-full justify-start gap-3 px-3 text-sm font-normal'
                onClick={() => {
                  onClose();
                  startLinkChecklist(expenseTarget.getSubject());
                }}
              >
                <ListChecks className='text-muted-foreground h-4 w-4' />
                Link or add a to-do
              </Button>
            )}
            {onSuggest && (
              <Button
                type='button'
                variant='tertiary'
                className='h-10 w-full justify-start gap-3 px-3 text-sm font-normal'
                onClick={() => onSuggest()}
              >
                <MessageSquarePlus className='text-muted-foreground h-4 w-4' />
                Suggest a change
              </Button>
            )}
            {onStack && (
              <Button
                type='button'
                variant='tertiary'
                className='h-10 w-full justify-start gap-3 px-3 text-sm font-normal'
                onClick={() => onStack()}
              >
                <Layers className='text-muted-foreground h-4 w-4' />
                {stackLabel}
              </Button>
            )}
            {onArchive && (
              <Button
                type='button'
                variant='tertiary'
                className='h-10 w-full justify-start gap-3 px-3 text-sm font-normal'
                onClick={() => onArchive()}
              >
                <Archive className='text-muted-foreground h-4 w-4' />
                {archiveLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default PlaceDetailsDrawer;
