import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useBookingStatus } from '@apps/waypoint/hooks/useBookingStatus';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface NotBookedBadgeProps {
  getSubject: () => RelatedSubject;
  /** A plain badge, for inside a details drawer, which can't have another sheet opened over it. */
  isStatic?: boolean;
  /** Hangs off the bottom-right corner of a card, outside it, like a tab. */
  variant?: 'inline' | 'tab';
}

/** Says an event still has something to book: nothing linked yet, or linked to-dos left to do. Gone once they are done. */
function NotBookedBadge({ getSubject, isStatic = false, variant = 'inline' }: NotBookedBadgeProps) {
  const tabClassName = 'bg-card border-border -mt-px rounded-t-none rounded-b-lg border border-t-0 px-3 py-1';
  const subject = getSubject();
  const { total, open, isNoBooking } = useBookingStatus(subject.link.kind, subject.link.id);
  const { startLinkChecklist, undoNoBooking, canManageChecklist } = useRelatedFlow();

  if (!subject.tracksBooking) {
    return null;
  }

  if (isNoBooking && open === 0) {
    return isStatic && canManageChecklist ? (
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className="text-muted-foreground relative h-auto px-0! text-xs font-medium whitespace-nowrap after:absolute after:-inset-x-2 after:-inset-y-2 after:content-['']"
        aria-label='Nothing to book: undo'
        onClick={() => undoNoBooking(getSubject())}
      >
        Nothing to book · Undo
      </Button>
    ) : null;
  }

  if (total > 0 && open === 0) {
    return null;
  }

  const label = (
    <>
      <span className='sm:hidden'>{open > 0 ? `🎟️ ${open} to book` : '🎟️ To book'}</span>
      <span className='max-sm:hidden'>{open > 0 ? `🎟️ ${open} to book` : '🎟️ No booking yet'}</span>
    </>
  );
  const accentClassName = open > 0 && 'bg-accent/15! text-foreground!';

  if (!canManageChecklist || isStatic) {
    return (
      <Badge
        variant='muted'
        outline
        data-paid-tab={variant === 'tab' ? '' : undefined}
        className={join('whitespace-nowrap', accentClassName, variant === 'tab' && tabClassName)}
      >
        {label}
      </Badge>
    );
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      data-paid-tab={variant === 'tab' ? '' : undefined}
      aria-label={open > 0 ? `${open} ${open === 1 ? 'to-do' : 'to-dos'} left to book: see or add to-dos` : 'No booking yet: link or add a to-do'}
      className={join(
        "text-muted-foreground relative h-auto text-xs font-medium whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        accentClassName,
        variant === 'tab' ? tabClassName : 'border-border rounded-full border px-2.5 py-0.5',
      )}
      onClick={(event) => {
        event.stopPropagation();
        startLinkChecklist(subject);
      }}
    >
      {label}
    </Button>
  );
}

export default NotBookedBadge;
