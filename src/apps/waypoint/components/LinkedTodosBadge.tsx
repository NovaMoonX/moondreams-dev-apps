import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useBookingStatus } from '@apps/waypoint/hooks/useBookingStatus';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface LinkedTodosBadgeProps {
  getSubject: () => RelatedSubject;
  /** A plain badge, for inside a details drawer, which can't have another sheet opened over it. */
  isStatic?: boolean;
  /** Hangs off the bottom-right corner of a card, outside it, like a tab. */
  variant?: 'inline' | 'tab';
}

function getBadgeContent(open: number, total: number, promptsBooking: boolean) {
  if (total === 0) {
    return promptsBooking
      ? { phone: '🎟️ To book', desktop: '🎟️ No booking yet', aria: 'No booking yet: link or add a to-do' }
      : null;
  }
  const done = total - open;
  if (open === 0) {
    return { phone: '✅ Done', desktop: '✅ All done', aria: `All ${total} to-dos done: see them` };
  }
  return {
    phone: `📝 ${open} to do`,
    desktop: done > 0 ? `📝 ${open} to do · ${done} of ${total} done` : `📝 ${open} to do`,
    aria: `${open} of ${total} to-dos still to do: see or add to-dos`,
  };
}

/** What is left on the to-dos linked to an event, what is done, or the prompt to add one. Hidden once the event has started. */
function LinkedTodosBadge({ getSubject, isStatic = false, variant = 'inline' }: LinkedTodosBadgeProps) {
  const tabClassName = 'bg-card border-border -mt-px rounded-t-none rounded-b-lg border border-t-0 px-3 py-1';
  const subject = getSubject();
  const { total, open, isNoBooking } = useBookingStatus(subject.link.kind, subject.link.id);
  const { startLinkChecklist, undoNoBooking, canManageChecklist } = useRelatedFlow();

  if (!subject.tracksTodos) {
    return null;
  }

  if (isNoBooking && total === 0) {
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

  const content = getBadgeContent(open, total, subject.tracksBooking);
  if (content === null) {
    return null;
  }

  const label = (
    <>
      <span className='sm:hidden'>{content.phone}</span>
      <span className='max-sm:hidden'>{content.desktop}</span>
    </>
  );
  const tintClassName = open > 0 && 'bg-accent/15! text-foreground!';

  if (!canManageChecklist || isStatic) {
    return (
      <Badge
        variant='muted'
        outline
        aria-label={content.aria}
        data-paid-tab={variant === 'tab' ? '' : undefined}
        className={join('whitespace-nowrap', tintClassName, variant === 'tab' && tabClassName)}
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
      aria-label={content.aria}
      className={join(
        "text-muted-foreground relative h-auto text-xs font-medium whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        tintClassName,
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

export default LinkedTodosBadge;
