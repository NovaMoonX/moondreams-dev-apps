import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { useHasExpense } from '@apps/waypoint/hooks/useHasExpense';
import type { ExpenseLinkKind } from '@apps/waypoint/types';

interface NotPaidForBadgeProps {
  kind: ExpenseLinkKind;
  id: string;
}

function NotPaidForBadge({ kind, id }: NotPaidForBadgeProps) {
  const hasExpense = useHasExpense(kind, id);

  if (hasExpense) {
    return null;
  }

  return (
    <Badge variant='muted' outline className='whitespace-nowrap'>
      💸 Not paid for yet
    </Badge>
  );
}

export default NotPaidForBadge;
