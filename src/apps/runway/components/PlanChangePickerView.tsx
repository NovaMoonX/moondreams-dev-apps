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

type NewKind = 'pay' | 'bill' | 'envelope' | 'goal';

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

interface PlanChangePickerViewProps {
  eventId: string;
  today: number;
  onBack: () => void;
}

/** The items a change can be planned for (pays, bills, envelopes, goals); the one picked opens its change form with this event already chosen as what the change is part of. */
function PlanChangePickerView({
  eventId,
  today,
  onBack,
}: PlanChangePickerViewProps) {
  const { showOnPlan } = useRunwayUrlState();
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<'pick' | 'kind' | 'date'>('pick');
  const [newKind, setNewKind] = useState<NewKind | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const startsOn = fromDateInputValue(startDate);
  const isStartValid =
    startsOn !== undefined &&
    startsOn > today &&
    startsOn <= addUtcDays(today, MAX_CHANGE_DAYS_AHEAD);

  const options: {
    id: string;
    name: string;
    noun: string;
    section: PlanSection;
    kind: keyof typeof PICK_KIND_HEADINGS;
  }[] = [
    ...sources.flatMap(({ payLines }) =>
      payLines.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        noun: HORIZON_WORDS.pickPay,
        section: 'income' as const,
        kind: 'income' as const,
      })),
    ),
    ...bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickBill,
      section: 'bills' as const,
      kind: 'bill' as const,
    })),
    ...envelopes.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickEnvelope,
      section: 'envelopes' as const,
      kind: 'envelope' as const,
    })),
    ...goals.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      noun: HORIZON_WORDS.pickGoal,
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
    if (kind === 'envelope' || kind === 'goal') setStep('date');
    else setIsFormOpen(true);
  };
  const closeForm = () => {
    setIsFormOpen(false);
    onBack();
  };
  const cancelForm = () => {
    setIsFormOpen(false);
    if (newKind === 'pay' || newKind === 'bill') setNewKind(null);
  };
  const forms = isFormOpen && newKind !== null && (
    <>
      {newKind === 'pay' && (
        <IncomeForm
          isOpen
          title='Income'
          defaultFrequency={null}
          eventId={eventId}
          onClose={closeForm}
          onCancel={cancelForm}
        />
      )}
      {newKind === 'bill' && (
        <BillForm
          isOpen
          title='Bill'
          eventId={eventId}
          onClose={closeForm}
          onCancel={cancelForm}
        />
      )}
      {newKind === 'envelope' && isStartValid && (
        <EnvelopeForm
          isOpen
          title='Envelope'
          eventId={eventId}
          startsOn={startsOn}
          onClose={closeForm}
          onCancel={cancelForm}
        />
      )}
      {newKind === 'goal' && isStartValid && (
        <GoalForm
          isOpen
          title='Goal'
          eventId={eventId}
          startsOn={startsOn}
          onClose={closeForm}
          onCancel={cancelForm}
        />
      )}
    </>
  );

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
        {forms}
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
              onClick={() => setIsFormOpen(true)}
            >
              {COMING_WORDS.newNext}
            </Button>
          }
        />
        {forms}
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
                {group.map(({ id, name, noun, section }) => (
                  <ActionRow
                    key={id}
                    isGrouped
                    hasChevron
                    icon={<ItemMark itemId={id} name={name} />}
                    label={name}
                    subtitle={noun}
                    onClick={() =>
                      void showOnPlan(section, {
                        itemId: id,
                        eventId,
                        returnTo: 'horizon',
                      })
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
