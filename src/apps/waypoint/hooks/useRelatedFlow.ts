import { createContext, useContext } from 'react';

import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface RelatedFlowContextValue {
  startFollowUp: (subject: RelatedSubject) => void;
}

export const RelatedFlowContext = createContext<RelatedFlowContextValue>({ startFollowUp: () => undefined });

export function useRelatedFlow() {
  return useContext(RelatedFlowContext);
}
