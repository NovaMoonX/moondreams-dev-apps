import { useMemo, useState, type ReactNode } from 'react';

import AddRelatedFlow, { type Step } from '@apps/waypoint/components/AddRelatedFlow';
import LinkExpenseSheet from '@apps/waypoint/components/LinkExpenseSheet';
import { RelatedFlowContext } from '@apps/waypoint/hooks/useRelatedFlow';
import type { TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface RelatedFlowProviderProps {
  trip: TripSpace;
  currentUserId: string;
  children: ReactNode;
}

type OpenFlow =
  | { id: number; kind: 'follow-up'; subject: RelatedSubject; initialStep: Step }
  | { id: number; kind: 'link'; subject: RelatedSubject };

// Mounted above the trip's screens: an idea leaves its list the moment it is converted, taking its own children with it.
function RelatedFlowProvider({ trip, currentUserId, children }: RelatedFlowProviderProps) {
  const [flow, setFlow] = useState<OpenFlow | null>(null);
  const canAddExpenses = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const value = useMemo(
    () => ({
      startFollowUp: (subject: RelatedSubject) =>
        setFlow((current) => ({ id: (current?.id ?? 0) + 1, kind: 'follow-up', subject, initialStep: 'menu' })),
      startLinkExpense: (subject: RelatedSubject) =>
        setFlow((current) => ({ id: (current?.id ?? 0) + 1, kind: 'link', subject })),
      canAddExpenses,
    }),
    [canAddExpenses],
  );

  return (
    <RelatedFlowContext.Provider value={value}>
      {children}
      {flow?.kind === 'follow-up' && (
        <AddRelatedFlow
          key={flow.id}
          trip={trip}
          currentUserId={currentUserId}
          subject={flow.subject}
          initialStep={flow.initialStep}
          onClose={() => setFlow(null)}
        />
      )}
      {flow?.kind === 'link' && (
        <LinkExpenseSheet
          key={flow.id}
          trip={trip}
          subject={flow.subject}
          currentUserId={currentUserId}
          onAddNew={() =>
            setFlow({ id: flow.id + 1, kind: 'follow-up', subject: flow.subject, initialStep: 'expense' })
          }
          onClose={() => setFlow(null)}
        />
      )}
    </RelatedFlowContext.Provider>
  );
}

export default RelatedFlowProvider;
