import { useMemo, useState, type ReactNode } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { setPlanNeedsNoBooking, setPlanNeedsNoExpense } from '@apps/waypoint/store/actions/tripActions';

import AddRelatedFlow, { type Step } from '@apps/waypoint/components/AddRelatedFlow';
import LinkChecklistSheet from '@apps/waypoint/components/LinkChecklistSheet';
import LinkExpenseSheet from '@apps/waypoint/components/LinkExpenseSheet';
import { RelatedFlowContext } from '@apps/waypoint/hooks/useRelatedFlow';
import type { TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';
import { getExpenseLinkKey, type RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';

interface RelatedFlowProviderProps {
  trip: TripSpace;
  currentUserId: string;
  children: ReactNode;
}

type OpenFlow =
  | { id: number; kind: 'follow-up'; subject: RelatedSubject; initialStep: Step; hasBookings?: boolean }
  | { id: number; kind: 'link'; subject: RelatedSubject }
  | { id: number; kind: 'link-checklist'; subject: RelatedSubject };

// Mounted above the trip's screens: an idea leaves its list the moment it is converted, taking its own children with it.
function RelatedFlowProvider({ trip, currentUserId, children }: RelatedFlowProviderProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [flow, setFlow] = useState<OpenFlow | null>(null);
  const canAddExpenses = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const value = useMemo(
    () => ({
      startFollowUp: (subject: RelatedSubject, options?: { hasBookings?: boolean }) =>
        setFlow((current) => ({
          id: (current?.id ?? 0) + 1,
          kind: 'follow-up',
          subject,
          initialStep: 'menu',
          hasBookings: options?.hasBookings,
        })),
      startLinkExpense: (subject: RelatedSubject) =>
        setFlow((current) => ({ id: (current?.id ?? 0) + 1, kind: 'link', subject })),
      undoNoExpense: (subject: RelatedSubject) =>
        void dispatch(
          setPlanNeedsNoExpense({
            uid: currentUserId,
            trip,
            linkKey: getExpenseLinkKey(subject.link),
            needsNone: false,
          }),
        )
          .unwrap()
          .catch((undoError) =>
            addToast({
              title: 'Unable to undo that',
              description: getErrorMessage(undoError, 'Please try again.'),
              type: 'error',
            }),
          ),
      startLinkChecklist: (subject: RelatedSubject) =>
        setFlow((current) => ({ id: (current?.id ?? 0) + 1, kind: 'link-checklist', subject })),
      undoNoBooking: (subject: RelatedSubject) =>
        void dispatch(
          setPlanNeedsNoBooking({
            uid: currentUserId,
            trip,
            linkKey: getExpenseLinkKey(subject.link),
            needsNone: false,
          }),
        )
          .unwrap()
          .catch((undoError) =>
            addToast({
              title: 'Unable to undo that',
              description: getErrorMessage(undoError, 'Please try again.'),
              type: 'error',
            }),
          ),
      canAddExpenses,
      canManageChecklist: canAddExpenses,
    }),
    [canAddExpenses, dispatch, addToast, currentUserId, trip],
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
          hasBookings={flow.hasBookings}
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
      {flow?.kind === 'link-checklist' && (
        <LinkChecklistSheet
          key={flow.id}
          trip={trip}
          subject={flow.subject}
          currentUserId={currentUserId}
          onAddNew={() =>
            setFlow({ id: flow.id + 1, kind: 'follow-up', subject: flow.subject, initialStep: 'checklist' })
          }
          onClose={() => setFlow(null)}
        />
      )}
    </RelatedFlowContext.Provider>
  );
}

export default RelatedFlowProvider;
