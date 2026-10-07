import { useMemo, useState, type ReactNode } from 'react';

import AddRelatedFlow from '@apps/waypoint/components/AddRelatedFlow';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';
import { RelatedFlowContext } from '@apps/waypoint/hooks/useRelatedFlow';
import type { TripSpace } from '@apps/waypoint/types';

interface RelatedFlowProviderProps {
  trip: TripSpace;
  currentUserId: string;
  children: ReactNode;
}

interface OpenFollowUp {
  id: number;
  subject: RelatedSubject;
}

// Mounted above the trip's screens: an idea leaves its list the moment it is converted, taking its own children with it.
function RelatedFlowProvider({ trip, currentUserId, children }: RelatedFlowProviderProps) {
  const [followUp, setFollowUp] = useState<OpenFollowUp | null>(null);
  const value = useMemo(
    () => ({
      startFollowUp: (subject: RelatedSubject) => setFollowUp((current) => ({ id: (current?.id ?? 0) + 1, subject })),
    }),
    [],
  );

  return (
    <RelatedFlowContext.Provider value={value}>
      {children}
      {followUp && (
        <AddRelatedFlow
          key={followUp.id}
          trip={trip}
          currentUserId={currentUserId}
          subject={followUp.subject}
          onClose={() => setFollowUp(null)}
        />
      )}
    </RelatedFlowContext.Provider>
  );
}

export default RelatedFlowProvider;
