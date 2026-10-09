import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useHasExpense, useIsNoExpense } from '@apps/waypoint/hooks/useHasExpense';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface NoExpenseBadgeProps {
  getSubject: () => RelatedSubject;
  /** A plain badge, for inside a details drawer, which can't have another sheet opened over it. */
  isStatic?: boolean;
  /** Hangs off the bottom-right corner of a card, outside it, like a tab. */
  variant?: 'inline' | 'tab';
}

/** For an editor the badge is also the way in: pick an expense already on the list, or add one. */
function NoExpenseBadge({ getSubject, isStatic = false, variant = 'inline' }: NoExpenseBadgeProps) {
  const tabClassName = 'bg-card border-border -mt-px rounded-t-none rounded-b-lg border border-t-0 px-3 py-1';
  const { link } = getSubject();
  const hasExpense = useHasExpense(link.kind, link.id);
  const isNoExpense = useIsNoExpense(link.kind, link.id);
  const { startLinkExpense, undoNoExpense, canAddExpenses } = useRelatedFlow();

  if (hasExpense) {
    return null;
  }

  if (isNoExpense) {
    return isStatic && canAddExpenses ? (
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className="text-muted-foreground relative h-auto px-0! text-xs font-medium whitespace-nowrap after:absolute after:-inset-x-2 after:-inset-y-2 after:content-['']"
        aria-label='No expense needed: undo'
        onClick={() => undoNoExpense(getSubject())}
      >
        No expense needed · Undo
      </Button>
    ) : null;
  }

  if (!canAddExpenses || isStatic) {
    return (
      <Badge variant='muted' outline data-paid-tab={variant === 'tab' ? '' : undefined} className={join('whitespace-nowrap', variant === 'tab' && tabClassName)}>
        💸 No expense yet
      </Badge>
    );
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      data-paid-tab={variant === 'tab' ? '' : undefined}
      aria-label='No expense yet: link or add an expense'
      className={join(
        "text-muted-foreground relative h-auto text-xs font-medium whitespace-nowrap after:absolute after:-inset-x-2 after:-inset-y-2 after:content-['']",
        variant === 'tab' ? tabClassName : 'border-border rounded-full border px-2.5 py-0.5',
      )}
      onClick={(event) => {
        event.stopPropagation();
        startLinkExpense(getSubject());
      }}
    >
      💸 No expense yet
    </Button>
  );
}

export default NoExpenseBadge;
