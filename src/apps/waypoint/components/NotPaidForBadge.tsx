import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { useHasExpense } from '@apps/waypoint/hooks/useHasExpense';
import { useRelatedFlow } from '@apps/waypoint/hooks/useRelatedFlow';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface NotPaidForBadgeProps {
  getSubject: () => RelatedSubject;
  /** A plain badge, for inside a details drawer, which can't have another sheet opened over it. */
  isStatic?: boolean;
}

/** For an editor the badge is also the way in: pick an expense already on the list, or add one. */
function NotPaidForBadge({ getSubject, isStatic = false }: NotPaidForBadgeProps) {
  const { link } = getSubject();
  const hasExpense = useHasExpense(link.kind, link.id);
  const { startLinkExpense, canAddExpenses } = useRelatedFlow();

  if (hasExpense) {
    return null;
  }

  if (!canAddExpenses || isStatic) {
    return (
      <Badge variant='muted' outline className='whitespace-nowrap'>
        💸 Not paid for yet
      </Badge>
    );
  }

  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label='Not paid for yet: link or add an expense'
      className="border-border text-muted-foreground relative h-auto rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap after:absolute after:-inset-2 after:content-['']"
      onClick={(event) => {
        event.stopPropagation();
        startLinkExpense(getSubject());
      }}
    >
      💸 Not paid for yet
    </Button>
  );
}

export default NotPaidForBadge;
