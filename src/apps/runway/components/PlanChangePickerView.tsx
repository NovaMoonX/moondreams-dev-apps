import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Banknote, Mail, Receipt, Sparkles, Target } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FoldedDateField from '@/components/FoldedDateField';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ItemMark from '@apps/runway/components/ItemMark';
import {
  COMING_WORDS,
  HORIZON_WORDS,
  MAX_CHANGE_DAYS_AHEAD,
  PICK_KIND_HEADINGS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import { addUtcDays } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import type { PlanSection } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

export type NewKind = 'pay' | 'bill' | 'envelope' | 'goal';

const NEW_ROWS: {
  kind: NewKind;
  label: string;
  sub: string;
  icon: ReactNode;
}[] = [
  {
    kind: 'pay',
    label: HORIZON_WORDS.pickPay,
    sub: COMING_WORDS.newPaySub,
    icon: <Banknote />,
  },
  {
    kind: 'bill',
    label: HORIZON_WORDS.pickBill,
    sub: COMING_WORDS.newBillSub,
    icon: <Receipt />,
  },
  {
    kind: 'envelope',
    label: HORIZON_WORDS.pickEnvelope,
    sub: COMING_WORDS.newEnvelopeSub,
    icon: <Mail />,
  },
  {
    kind: 'goal',
    label: HORIZON_WORDS.pickGoal,
    sub: COMING_WORDS.newGoalSub,
    icon: <Target />,
  },
];

interface NewItemFormProps {
  kind: NewKind;
  eventId: string;
  startsOn: number;
  onClose: () => void;
  onCancel: () => void;
}

/** The create form for something new that starts on the day already picked, part of the event; drawn in place of the event's sheet so only one drawer shows. */
export function NewItemForm({
  kind,
  eventId,
  startsOn,
  onClose,
  onCancel,
}: NewItemFormProps) {
  if (kind === 'pay')
    return (
      <IncomeForm
        isOpen
        title='Income'
        defaultFrequency={null}
        eventId={eventId}
        startsOn={startsOn}
        onClose={onClose}
        onCancel={onCancel}
      />
    );
  if (kind === 'bill')
    return (
      <BillForm
        isOpen
        title='Bill'
        eventId={eventId}
        startsOn={startsOn}
        onClose={onClose}
        onCancel={onCancel}
      />
    );
  if (kind === 'envelope')
    return (
      <EnvelopeForm
        isOpen
        title='Envelope'
        eventId={eventId}
        startsOn={startsOn}
        onClose={onClose}
        onCancel={onCancel}
      />
    );
  return (
    <GoalForm
      isOpen
      title='Goal'
      eventId={eventId}
      startsOn={startsOn}
      onClose={onClose}
      onCancel={onCancel}
    />
  );
}

interface PlanChangePickerViewProps {
  eventId: string;
  today: number;
  /** The kind and start day picked before the create form was cancelled, so the picker reopens on that date step. */
  resume?: { kind: NewKind; startsOn: number } | null;
  onBack: () => void;
  /** Opens the create form for something new, once its start day is picked. */
  onStartNew: (kind: NewKind, startsOn: number) => void;
}

/** The items a change can be planned for (pays, bills, envelopes, goals); the one picked opens its change form with this event already chosen as what the change is part of. */
function PlanChangePickerView({
  eventId,
  today,
  resume = null,
  onBack,
  onStartNew,
}: PlanChangePickerViewProps) {
  const { showOnPlan } = useRunwayUrlState();
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<'pick' | 'kind' | 'date'>(
    resume ? 'date' : 'pick',
  );
  const [newKind, setNewKind] = useState<NewKind | null>(resume?.kind ?? null);
  const [startDate, setStartDate] = useState(
    resume ? toDateInputValue(resume.startsOn) : '',
  );
  const startsOn = fromDateInputValue(startDate);
  const isStartValid =
    startsOn !== undefined &&
    startsOn > today &&
    startsOn <= addUtcDays(today, MAX_CHANGE_DAYS_AHEAD);

  const options: {
    id: string;
    name: string;
    section: PlanSection;
    kind: keyof typeof PICK_KIND_HEADINGS;
  }[] = [
    ...sources.flatMap(({ payLines }) =>
      payLines.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        section: 'income' as const,
        kind: 'income' as const,
      })),
    ),
    ...bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      section: 'bills' as const,
      kind: 'bill' as const,
    })),
    ...envelopes.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      section: 'envelopes' as const,
      kind: 'envelope' as const,
    })),
    ...goals.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      section: 'goals' as const,
      kind: 'goal' as const,
    })),
  ];
  const hasSearch = options.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = options.filter(({ name }) =>
    name.toLowerCase().includes(needle),
  );

  const pickNew = (kind: NewKind) => {
    setNewKind(kind);
    setStep('date');
  };

  if (step === 'kind') {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackLink onBack={() => setStep('pick')} />
        <ActionTitle>{COMING_WORDS.newTitle}</ActionTitle>
        <ActionGroup isRoomy>
          {NEW_ROWS.map(({ kind, label, sub, icon }) => (
            <ActionRow
              key={kind}
              isGrouped
              isRoomy
              hasChevron
              icon={icon}
              label={label}
              subtitle={sub}
              onClick={() => pickNew(kind)}
            />
          ))}
        </ActionGroup>
      </div>
    );
  }

  if (step === 'date') {
    return (
      <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
        <BackLink onBack={() => setStep('kind')} />
        <ActionTitle>{COMING_WORDS.newStartsTitle}</ActionTitle>
        <FoldedDateField
          label={COMING_WORDS.newStartsLabel}
          todayValue={toDateInputValue(addUtcDays(today, 1))}
          min={toDateInputValue(addUtcDays(today, 1))}
          max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
          value={startDate}
          onChange={setStartDate}
        />
        <ModalFooterActions
          note={isStartValid ? null : COMING_WORDS.newStartsBlocker}
          rightActions={
            <Button
              type='button'
              disabled={!isStartValid}
              onClick={() =>
                newKind && startsOn && onStartNew(newKind, startsOn)
              }
            >
              {COMING_WORDS.newNext}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_WORDS.planChangeTitle}</ActionTitle>
      <ActionGroup>
        <ActionRow
          isGrouped
          hasChevron
          icon={<Sparkles />}
          label={COMING_WORDS.somethingNew}
          subtitle={COMING_WORDS.somethingNewSub}
          onClick={() => setStep('kind')}
        />
      </ActionGroup>
      {hasSearch && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={HORIZON_WORDS.planChangeSearch}
        />
      )}
      {options.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.planChangeNone}
        </p>
      ) : visible.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.planChangeNoMatch}
        </p>
      ) : (
        (
          Object.keys(PICK_KIND_HEADINGS) as (keyof typeof PICK_KIND_HEADINGS)[]
        ).map((kind) => {
          const group = visible.filter((option) => option.kind === kind);
          return group.length === 0 ? null : (
            <div key={kind} className='space-y-2'>
              <SectionDivider label={PICK_KIND_HEADINGS[kind]} />
              <ActionGroup>
                {group.map(({ id, name, section }) => (
                  <ActionRow
                    key={id}
                    isGrouped
                    hasChevron
                    icon={<ItemMark itemId={id} name={name} />}
                    label={name}
                    onClick={() =>
                      afterBackLayersClose(
                        () =>
                          void showOnPlan(section, {
                            itemId: id,
                            eventId,
                            returnTo: 'horizon',
                          }),
                      )
                    }
                  />
                ))}
              </ActionGroup>
            </div>
          );
        })
      )}
    </div>
  );
}

export default PlanChangePickerView;
