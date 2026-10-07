import { createContext, useContext } from 'react';

import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface RelatedFlowContextValue {
  startFollowUp: (subject: RelatedSubject) => void;
  /** Opens the sheet that links an existing expense to a plan, or adds a new one for it. */
  startLinkExpense: (subject: RelatedSubject) => void;
  canAddExpenses: boolean;
}

export const RelatedFlowContext = createContext<RelatedFlowContextValue>({
  startFollowUp: () => undefined,
  startLinkExpense: () => undefined,
  canAddExpenses: false,
});

export function useRelatedFlow() {
  return useContext(RelatedFlowContext);
}
