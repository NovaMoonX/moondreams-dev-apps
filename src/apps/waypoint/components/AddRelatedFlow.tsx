import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import Pill from '@/components/Pill';
import SuggestionChips from '@/components/SuggestionChips';
import { PillRow } from '@/components/PillGroup';
import { getLocalDayIndex } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { useBookingStatus } from '@apps/waypoint/hooks/useBookingStatus';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import ChecklistItemFormModal, {
  type ChecklistPrefill,
  type ChecklistSubmitValues,
} from '@apps/waypoint/components/ChecklistItemFormModal';
import ExpenseFormModal, {
  type ExpensePrefill,
  type ExpenseSubmitValues,
} from '@apps/waypoint/components/ExpenseFormModal';
import { createChecklistItem, deleteChecklistItem } from '@apps/waypoint/store/actions/checklistActions';
import { createExpense } from '@apps/waypoint/store/actions/expenseActions';
import { selectTripExpenses } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import type { RelatedSubject } from '@apps/waypoint/utils/relatedSubjects';
import { getExpenseCategoryKeys } from '@apps/waypoint/utils/expenseCategories';
import { BOOKING_VERBS } from '@apps/waypoint/constants';
import { getBookingDueDay } from '@apps/waypoint/utils/bookingItems';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

interface AddRelatedFlowProps {
  trip: TripSpace;
  currentUserId: string;
  subject: RelatedSubject;
  /** Opening straight on the expense form closes the flow when that form does. */
  initialStep?: Step;
  /** To-dos were linked in the same save, so booking isn't asked about again. */
  hasBookings?: boolean;
  onClose: () => void;
}

export type Step = 'menu' | 'expense' | 'checklist';

interface FollowUpRowProps {
  emoji: string;
  title: string;
  description: string;
  addedCount: number;
  onClick: () => void;
}

function FollowUpRow({ emoji, title, description, addedCount, onClick }: FollowUpRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-auto min-h-12 w-full justify-start gap-3 rounded-none px-3! py-3 text-left font-normal'
      onClick={onClick}
    >
      <span className='w-5 shrink-0 text-center' aria-hidden='true'>
        {emoji}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-sm font-medium'>{title}</span>
        <span className='text-muted-foreground block text-xs'>{description}</span>
      </span>
      {addedCount > 0 && (
        <span className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'>✓ {addedCount} added</span>
      )}
      <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
    </Button>
  );
}

function AddRelatedFlow({ trip, currentUserId, subject, initialStep = 'menu', hasBookings, onClose }: AddRelatedFlowProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const existingBookings = useBookingStatus(subject.link.kind, subject.link.id);
  const [alreadyHadBookings] = useState(hasBookings ?? existingBookings.total > 0);
  const [bookingAnswer, setBookingAnswer] = useState<'yes' | 'none' | null>(null);
  const [booking, setBooking] = useState<{ id: string; title: string } | null>(null);
  const expenses = useAppSelector(selectTripExpenses);
  const memberIds = useMemo(() => Object.keys(trip.members), [trip.members]);
  const memberInfo = useUserInfo(memberIds);
  const [step, setStep] = useState<Step>(initialStep);
  const backToMenu = () => (initialStep === 'menu' ? setStep('menu') : onClose());
  const [added, setAdded] = useState({ expense: 0, checklist: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canAdd = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const categoryKeys = useMemo(() => getExpenseCategoryKeys(expenses), [expenses]);
  const existingGroupLabels = useMemo(
    () =>
      Array.from(
        new Set(expenses.map((expense) => expense.groupLabel).filter((label): label is string => label !== null)),
      ).sort(),
    [expenses],
  );
  const expensePrefill = useMemo<ExpensePrefill>(
    () => ({
      link: subject.link,
      attendeeIds: subject.attendeeIds,
      title: subject.title,
      dayIndex: subject.dayIndex,
      category: subject.expenseCategory,
      prefersEstimate: subject.prefersEstimate,
    }),
    [subject],
  );
  const checklistPrefill = useMemo<ChecklistPrefill>(
    () => ({ category: subject.checklistCategory, completeByDayIndex: subject.dayIndex }),
    [subject],
  );
  const memberOptions = memberIds.map((uid) => ({
    label: memberInfo?.map[uid]?.displayName?.trim() || memberInfo?.map[uid]?.email || 'Trip member',
    value: uid,
  }));

  if (!canAdd) {
    return null;
  }

  const handleExpense = async (values: ExpenseSubmitValues) => {
    setIsSubmitting(true);
    try {
      await dispatch(
        createExpense({
          uid: currentUserId,
          tripId: trip.id,
          memberIds,
          ...values,
          split: values.split ?? { targetType: 'EVERYONE_CURRENT', targetMemberIds: [] },
        }),
      ).unwrap();
      setAdded((current) => ({ ...current, expense: current.expense + 1 }));
      backToMenu();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChecklist = async (values: ChecklistSubmitValues) => {
    setIsSubmitting(true);
    try {
      await dispatch(
        createChecklistItem({ tripId: trip.id, uid: currentUserId, ...values, linkedTo: subject.link }),
      ).unwrap();
      setAdded((current) => ({ ...current, checklist: current.checklist + 1 }));
      addToast({ title: `Added ${values.title.trim()}, linked to ${subject.title}`, type: 'success' });
      backToMenu();
    } finally {
      setIsSubmitting(false);
    }
  };

  const addBooking = async (label: string) => {
    const verb = BOOKING_VERBS.find((candidate) => candidate.label === label);
    if (!verb || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await dispatch(
        createChecklistItem({
          tripId: trip.id,
          uid: currentUserId,
          title: `${verb.prefix} ${subject.title}`,
          category: 'BOOKINGS',
          customCategoryLabel: null,
          note: null,
          completeByDayIndex: getBookingDueDay(subject.dayIndex, getLocalDayIndex(trip.startDate, Date.now())),
          assignedToUids: [currentUserId],
          isPrivate: false,
          linkedTo: subject.link,
        }),
      ).unwrap();
      setBooking({ id: created.id, title: created.title });
    } catch (addError) {
      addToast({
        title: 'Unable to add that to-do',
        description: getErrorMessage(addError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const undoBooking = async () => {
    if (!booking || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await dispatch(deleteChecklistItem({ trip, uid: currentUserId, itemId: booking.id, isPrivate: false })).unwrap();
      setBooking(null);
    } catch (undoError) {
      addToast({
        title: 'Unable to undo that',
        description: getErrorMessage(undoError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DetailSheet
        isOpen={step === 'menu'}
        onClose={onClose}
        title={subject.title}
        footer={
          <div className='flex flex-col gap-2'>
            <Button type='button' size='lg' onClick={onClose}>
              Done
            </Button>
          </div>
        }
      >
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>Saved. Want to line up the rest while it&apos;s fresh?</p>
          {subject.tracksBooking && !alreadyHadBookings && (
            <div className='space-y-3'>
              <div className='flex items-start gap-3'>
                <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                  🎟️
                </span>
                <div className='min-w-0'>
                  <p className='text-sm font-medium'>Does anything need booking ahead?</p>
                  <p className='text-muted-foreground text-xs'>Tickets, a time slot, a pass. We&apos;ll add it to Before the Road.</p>
                </div>
              </div>
              <PillRow label='Does anything need booking ahead?'>
                <Pill isSelected={bookingAnswer === 'yes'} onClick={() => setBookingAnswer('yes')}>
                  Yes, something
                </Pill>
                <Pill
                  isSelected={bookingAnswer === 'none'}
                  isDisabled={booking !== null}
                  onClick={() => setBookingAnswer('none')}
                >
                  Nope, all set
                </Pill>
              </PillRow>
              {bookingAnswer === 'yes' &&
                (booking ? (
                  <div className='flex items-center gap-3 text-sm'>
                    <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                      ✓
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block font-medium'>{booking.title}</span>
                      <span className='text-muted-foreground block text-xs'>Added to your checklist</span>
                    </span>
                    <Button type='button' variant='tertiary' size='sm' disabled={isSubmitting} onClick={() => void undoBooking()}>
                      Undo
                    </Button>
                  </div>
                ) : (
                  <SuggestionChips
                    label='What do you need to do?'
                    suggestions={BOOKING_VERBS.map((verb) => verb.label)}
                    onPick={(label) => void addBooking(label)}
                  />
                ))}
            </div>
          )}
          <div className='bg-muted/50 divide-border divide-y overflow-hidden rounded-xl'>
            <FollowUpRow
              emoji='💸'
              title='Add an expense'
              description='Tickets, a deposit, the tab. Starts with this one filled in.'
              addedCount={added.expense}
              onClick={() => setStep('expense')}
            />
            <FollowUpRow
              emoji='🧳'
              title={subject.tracksBooking && !alreadyHadBookings ? 'Add another to-do' : 'Add a checklist item'}
              description={
                subject.tracksBooking && !alreadyHadBookings
                  ? 'Something to bring or do, with people and a due day.'
                  : 'Something to book, bring or do before it.'
              }
              addedCount={added.checklist}
              onClick={() => setStep('checklist')}
            />
          </div>
        </div>
      </DetailSheet>
      {step === 'expense' && (
        <ExpenseFormModal
          key={`expense-${added.expense}`}
          isOpen
          trip={trip}
          currentUserId={currentUserId}
          prefill={expensePrefill}
          categoryKeys={categoryKeys}
          existingGroupLabels={existingGroupLabels}
          isSubmitting={isSubmitting}
          onSubmit={handleExpense}
          onClose={backToMenu}
        />
      )}
      {step === 'checklist' && (
        <ChecklistItemFormModal
          key={`checklist-${added.checklist}`}
          isOpen
          trip={trip}
          currentUserId={currentUserId}
          prefill={checklistPrefill}
          allowPrivate={false}
          forTitle={subject.title}
          memberOptions={memberOptions}
          isSubmitting={isSubmitting}
          onSubmit={handleChecklist}
          onClose={backToMenu}
        />
      )}
    </>
  );
}

export default AddRelatedFlow;
