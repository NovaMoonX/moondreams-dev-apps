import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Label,
} from '@moondreamsdev/dreamer-ui/components';

import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useUnsavedWork } from '@/hooks/useUnsavedWork';
import GatesClosedNote from '@/components/GatesClosedNote';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import ExternalLinkText from '@/components/ExternalLinkText';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import {
  fromDateInputValue,
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import MoneyInput from '@/components/MoneyInput';
import Pill from '@/components/Pill';
import WeekResetHelp from '@apps/a-list/components/shared/WeekResetHelp';
import {
  MAX_MONTHLY_GOAL,
  MAX_WEEKLY_GOAL,
  TICKET_PRICE_KIND_LABELS,
  TICKET_PRICE_KINDS,
  CALENDAR_RELEASES_GATE_ID,
} from '@apps/a-list/constants';
import {
  updateMembership,
  type MembershipEditableFields,
} from '@apps/a-list/store/actions/membershipActions';
import type { MembershipProfile, TicketPriceKind } from '@apps/a-list/types';
import { getTicketPriceKind } from '@apps/a-list/utils/ticketPrice';
import {
  evaluateCostStep,
  type CostStepValues,
} from '@apps/a-list/utils/costStep';
import { centsToInputValue } from '@/utils/moneyUtils';
import { formatTaxRate } from '@apps/a-list/utils/tax';
import DateInput from '@/components/DateInput';

interface GoalValues {
  weeklyGoal: string;
  monthlyGoal: string;
}

interface MembershipDraft {
  costValues: CostStepValues;
  goalValues: GoalValues;
  ticketPriceKind: TicketPriceKind;
  showReleasesOnCalendar: boolean;
}

function parseMembershipDraft(stored: unknown): MembershipDraft | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { costValues, goalValues, ticketPriceKind, showReleasesOnCalendar } =
    stored as Partial<MembershipDraft>;
  const knownKind = TICKET_PRICE_KINDS.find((kind) => kind === ticketPriceKind);
  const isShaped =
    knownKind !== undefined &&
    typeof costValues?.cost === 'string' &&
    typeof costValues.billTotal === 'string' &&
    typeof costValues.startDate === 'string' &&
    typeof costValues.showBillTotal === 'boolean' &&
    typeof goalValues?.weeklyGoal === 'string' &&
    typeof goalValues.monthlyGoal === 'string';
  if (!isShaped) return null;
  return {
    costValues: {
      cost: costValues.cost,
      billTotal: costValues.billTotal,
      startDate: costValues.startDate,
      showBillTotal: costValues.showBillTotal,
    },
    goalValues: {
      weeklyGoal: goalValues.weeklyGoal,
      monthlyGoal: goalValues.monthlyGoal,
    },
    ticketPriceKind: knownKind,
    showReleasesOnCalendar: showReleasesOnCalendar !== false,
  };
}

const { custom, input } = FormFactories;
const COST_GROUP = [
  'monthlyCostCents',
  'monthlyTotalCents',
  'taxRate',
] as const;

/** A blank goal is "no goal"; anything else must be a whole number in range. */
function parseGoal(
  value: string,
  max: number,
): { goal: number | null; isValid: boolean } {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { goal: null, isValid: true };
  }

  const goal = Number(trimmed);
  const isValid = Number.isInteger(goal) && goal >= 1 && goal <= max;
  return { goal: isValid ? goal : null, isValid };
}

interface MembershipSettingsSubviewProps {
  membership: MembershipProfile;
  onClose: () => void;
}

function MembershipSettingsSubview({
  membership,
  onClose,
}: MembershipSettingsSubviewProps) {
  const dispatch = useAppDispatch();
  const now = useNow();
  const canShowReleases = useIsGateOpen('a-list', CALENDAR_RELEASES_GATE_ID);
  // Only fields the member changed in this form are written, so a concurrent edit to another field survives.
  const [openedWith] = useState(membership);
  const [start] = useState<MembershipDraft>(() => ({
    costValues: {
      cost: centsToInputValue(membership.monthlyCostCents),
      billTotal:
        membership.taxRate === null
          ? ''
          : centsToInputValue(membership.monthlyTotalCents),
      startDate: toDateInputValue(membership.startDate),
      showBillTotal: membership.taxRate !== null,
    },
    goalValues: {
      weeklyGoal: membership.weeklyGoal?.toString() ?? '',
      monthlyGoal: membership.monthlyGoal?.toString() ?? '',
    },
    ticketPriceKind: getTicketPriceKind(membership),
    showReleasesOnCalendar: membership.showReleasesOnCalendar !== false,
  }));
  const draftKey = `a-list:membership:${membership.uid}`;
  const draft = useFormDraft({
    key: draftKey,
    base: start,
    parse: parseMembershipDraft,
  });
  const [begin] = useState(draft.restored ?? start);
  const [costValues, setCostValues] = useState<CostStepValues>(
    begin.costValues,
  );
  const [goalValues, setGoalValues] = useState<GoalValues>(begin.goalValues);
  const [ticketPriceKind, setTicketPriceKind] = useState<TicketPriceKind>(
    begin.ticketPriceKind,
  );
  const [showReleasesOnCalendar, setShowReleasesOnCalendar] = useState(
    begin.showReleasesOnCalendar,
  );
  const [formKey, setFormKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
  const cost = evaluateCostStep(costValues, todayDay);
  const weekly = parseGoal(goalValues.weeklyGoal, MAX_WEEKLY_GOAL);
  const monthly = parseGoal(goalValues.monthlyGoal, MAX_MONTHLY_GOAL);
  const isValid = cost.isValid && weekly.isValid && monthly.isValid;

  const getChangedFields = (): Partial<MembershipEditableFields> => {
    if (!isValid || cost.costCents === null || cost.startDate === null) {
      return {};
    }

    const next: MembershipEditableFields = {
      monthlyCostCents: cost.costCents,
      monthlyTotalCents: cost.billTotalCents ?? cost.costCents,
      taxRate: cost.billTotalCents === null ? null : cost.taxRate,
      startDate: cost.startDate,
      weeklyGoal: weekly.goal,
      monthlyGoal: monthly.goal,
      ticketPriceKind,
      showReleasesOnCalendar,
    };
    const openedValues: MembershipEditableFields = {
      ...openedWith,
      ticketPriceKind: getTicketPriceKind(openedWith),
      showReleasesOnCalendar: openedWith.showReleasesOnCalendar !== false,
    };
    const changed = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) =>
          openedValues[key as keyof MembershipEditableFields] !== value,
      ),
    ) as Partial<MembershipEditableFields>;
    // Cost, total and rate are derived from each other, so they're written as one group.
    const isCostGroupChanged = COST_GROUP.some((key) => key in changed);
    const result = isCostGroupChanged
      ? {
          ...changed,
          monthlyCostCents: next.monthlyCostCents,
          monthlyTotalCents: next.monthlyTotalCents,
          taxRate: next.taxRate,
        }
      : changed;
    return result;
  };

  const changedFields = getChangedFields();
  const hasChanges = Object.keys(changedFields).length > 0;
  useUnsavedWork(() => hasChanges);
  const draftValue = useMemo(
    () => ({
      costValues,
      goalValues,
      ticketPriceKind,
      showReleasesOnCalendar,
    }),
    [costValues, goalValues, ticketPriceKind, showReleasesOnCalendar],
  );
  useKeepFormDraft({
    isRestored: draft.restored !== null,
    key: draftKey,
    base: start,
    value: draftValue,
    isDirty: JSON.stringify(draftValue) !== JSON.stringify(start),
  });
  const startOver = () => {
    setCostValues(start.costValues);
    setGoalValues(start.goalValues);
    setTicketPriceKind(start.ticketPriceKind);
    setShowReleasesOnCalendar(start.showReleasesOnCalendar);
    setFormKey((current) => current + 1);
    draft.hideNotice();
  };

  const handleSave = async () => {
    if (!hasChanges) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await dispatch(
        updateMembership({ uid: membership.uid, fields: changedFields }),
      ).unwrap();
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save your membership.'));
      setIsSaving(false);
    }
  };

  const costError = cost.errors.cost;
  const billTotalError = cost.errors.billTotal;
  const costFields = [
    custom({
      name: 'cost',
      label: 'Monthly cost before tax',
      description: 'A new cost applies to every month so far, for now.',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel='Monthly cost before tax'
          placeholder={centsToInputValue(membership.monthlyCostCents)}
          value={(props.value as string | undefined) ?? ''}
          errorMessage={costError}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    ...(costValues.showBillTotal
      ? [
          custom({
            name: 'billTotal',
            label: 'Total on your bill, with tax',
            renderComponent: (props) => (
              <MoneyInput
                ariaLabel='Total on your bill, with tax'
                placeholder={centsToInputValue(membership.monthlyTotalCents)}
                value={(props.value as string | undefined) ?? ''}
                errorMessage={billTotalError}
                onChange={(value) => props.onValueChange(value)}
              />
            ),
          }),
        ]
      : []),
  ];

  const goalFields = [
    input({
      name: 'weeklyGoal',
      label: 'Movies a week',
      description: 'Counted Friday to Friday, like AMC.',
      type: 'number',
      placeholder: membership.weeklyGoal?.toString() ?? '2',
      variant: 'outline',
      rounded: 'full',
      isValid: (value) =>
        parseGoal(value, MAX_WEEKLY_GOAL).isValid
          ? { valid: true }
          : {
              valid: false,
              message: `A whole number from 1 to ${MAX_WEEKLY_GOAL}.`,
            },
    }),
    input({
      name: 'monthlyGoal',
      label: 'Movies a month',
      description: 'Counted by calendar month.',
      type: 'number',
      placeholder: membership.monthlyGoal?.toString() ?? '6',
      variant: 'outline',
      rounded: 'full',
      isValid: (value) =>
        parseGoal(value, MAX_MONTHLY_GOAL).isValid
          ? { valid: true }
          : {
              valid: false,
              message: `A whole number from 1 to ${MAX_MONTHLY_GOAL}.`,
            },
    }),
  ];

  return (
    <Subview title='Membership' onClose={onClose}>
      <div className='space-y-4'>
        {draft.isNoticeShown && (
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={draft.hideNotice}
          />
        )}
        <div className='bg-secondary/60 flex items-center gap-3 rounded-2xl px-4 py-3'>
          <span className='text-3xl' aria-hidden='true'>
            🎟️
          </span>
          <div className='min-w-0'>
            <p className='font-semibold'>AMC A-List</p>
            <p className='text-muted-foreground text-sm'>
              Member since {formatDateUTC(membership.startDate)}
            </p>
          </div>
        </div>
        <SectionDivider label='💳 Monthly cost' />
        <div className='space-y-2'>
          <Form
            key={`${formKey}-${costValues.showBillTotal ? 'with-bill' : 'no-bill'}`}
            id='a-list-settings-cost'
            form={costFields}
            initialData={costValues}
            columns={1}
            spacing='normal'
            onDataChange={(data) =>
              setCostValues({
                ...costValues,
                ...(data as Partial<CostStepValues>),
              })
            }
          />
          {costValues.showBillTotal ? (
            <div className='flex items-start justify-between gap-3'>
              <p className='text-muted-foreground text-sm'>
                {cost.taxRate !== null && !billTotalError
                  ? `That works out to about ${formatTaxRate(cost.taxRate)} tax.`
                  : 'Add the total from your bill and we’ll work out your tax rate.'}
              </p>
              <Button
                type='button'
                variant='link'
                size='sm'
                className='shrink-0'
                onClick={() =>
                  setCostValues({
                    ...costValues,
                    billTotal: '',
                    showBillTotal: false,
                  })
                }
              >
                Remove total
              </Button>
            </div>
          ) : (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='px-0'
              onClick={() =>
                setCostValues({ ...costValues, showBillTotal: true })
              }
            >
              + Add the total on your bill
            </Button>
          )}
        </div>
        <SectionDivider label='📆 Start date' />
        <div className='space-y-1.5'>
          <Label>When did your membership start?</Label>
          <DateInput
            variant='outline'
            rounded='full'
            aria-label='Membership start date'
            max={toDateInputValue(todayDay)}
            value={costValues.startDate}
            errorMessage={cost.errors.startDate}
            onChange={(event) =>
              setCostValues({ ...costValues, startDate: event.target.value })
            }
          />
        </div>
        <SectionDivider label='🎟️ Ticket prices' />
        <div className='space-y-2'>
          <Label>Which AMC price should showtimes show?</Label>
          <div className='flex flex-wrap gap-2'>
            {TICKET_PRICE_KINDS.map((kind) => (
              <Pill
                key={kind}
                isSelected={ticketPriceKind === kind}
                onClick={() => setTicketPriceKind(kind)}
              >
                {TICKET_PRICE_KIND_LABELS[kind]}
              </Pill>
            ))}
          </div>
          <p className='text-muted-foreground text-sm'>
            Tickets you add from a showtime start from this price. Tickets you
            already saved keep theirs.
          </p>
        </div>
        {canShowReleases && (
          <>
            <SectionDivider label='📅 Calendar' />
            <div className='space-y-2'>
              <Label>Show release days on your calendar?</Label>
              <div className='flex flex-wrap gap-2'>
                <Pill
                  isSelected={showReleasesOnCalendar}
                  onClick={() => setShowReleasesOnCalendar(true)}
                >
                  Show them
                </Pill>
                <Pill
                  isSelected={!showReleasesOnCalendar}
                  onClick={() => setShowReleasesOnCalendar(false)}
                >
                  Hide them
                </Pill>
              </div>
              <p className='text-muted-foreground text-sm'>
                {showReleasesOnCalendar
                  ? 'The day a movie on your watchlist opens gets a dashed gold outline, until you plan it.'
                  : 'Your calendar shows only what you’ve planned. The Watchlist still shows what opens this week.'}
              </p>
            </div>
          </>
        )}
        <SectionDivider label='🎯 Goals' trailing={<WeekResetHelp />} />
        <Form
          key={formKey}
          id='a-list-settings-goals'
          form={goalFields}
          initialData={goalValues}
          columns={2}
          spacing='normal'
          onDataChange={(data) => setGoalValues(data as GoalValues)}
        />
        <div className='text-muted-foreground space-y-2 pt-2 text-xs'>
          <div className='flex items-center gap-3'>
            <img
              src='/logos/tmdb.svg'
              alt='TMDB'
              className='h-3 w-auto shrink-0'
            />
            <span>
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </span>
          </div>
          <div className='flex flex-wrap items-center gap-1'>
            <span>Some movie details and posters come from</span>
            <ExternalLinkText
              href='https://www.omdbapi.com/'
              label='OMDb'
              className='text-xs'
            />
            <span>(CC BY-NC 4.0).</span>
          </div>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button
                type='button'
                variant='secondary'
                rounded='full'
                disabled={isSaving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type='button'
                rounded='full'
                loading={isSaving}
                disabled={!isValid || !hasChanges || isSaving}
                onClick={() => void handleSave()}
              >
                Save
              </Button>
            </>
          }
        />
        <GatesClosedNote appId='a-list' className='pt-2' />
      </div>
    </Subview>
  );
}

export default MembershipSettingsSubview;
