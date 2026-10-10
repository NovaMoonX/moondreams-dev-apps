import { createContext, useContext } from 'react';

import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface RelatedFlowContextValue {
  /** `hasBookings` says to-dos were just linked in the same save, so the sheet doesn't ask about booking again. */
  startFollowUp: (subject: RelatedSubject, options?: { hasBookings?: boolean }) => void;
  /** Opens the sheet that links an existing expense to a plan, or adds a new one for it. */
  startLinkExpense: (subject: RelatedSubject) => void;
  /** Puts a plan marked "no expense needed" back on the no-expense list. */
  undoNoExpense: (subject: RelatedSubject) => void;
  startLinkChecklist: (subject: RelatedSubject) => void;
  canAddExpenses: boolean;
  /** Admins and Editors link and add to-dos; the same people who add expenses. */
  canManageChecklist: boolean;
}

export const RelatedFlowContext = createContext<RelatedFlowContextValue>({
  startFollowUp: () => undefined,
  startLinkExpense: () => undefined,
  undoNoExpense: () => undefined,
  startLinkChecklist: () => undefined,
  canAddExpenses: false,
  canManageChecklist: false,
});

export function useRelatedFlow() {
  return useContext(RelatedFlowContext);
}
