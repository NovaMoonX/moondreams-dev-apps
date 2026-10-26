import { useState, type ReactNode } from 'react';
import { Mail, ReceiptText, Wallet } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { START_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectListedDays,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const STEPS = ['income', 'bills', 'envelopes', 'stand', 'done'] as const;
type Step = (typeof STEPS)[number];
type FormName = 'income' | 'bill' | 'envelope' | 'goal' | 'stand';

interface AddedListProps {
  rows: { id: string; name: string; emoji: string | null }[];
  /** What the empty list says in place of nothing, so a step that has had no answer yet is still a card. */
  emptyText: string;
  emptyIcon: ReactNode;
}

/** What has been added in this step, capped so fifty bills stay a short list. */
function AddedList({ rows, emptyText, emptyIcon }: AddedListProps) {
  if (rows.length === 0)
    return <EmptyCard icon={emptyIcon}>{emptyText}</EmptyCard>;
  const shown = rows.slice(0, 4);
  return (
    <div className='border-border bg-card rounded-2xl border p-3'>
      <ul className='space-y-2'>
        {shown.map((row) => (
          <li key={row.id} className='flex items-start gap-3'>
            <ItemBadge name={row.name} emoji={row.emoji} />
            <p className='line-clamp-2 min-w-0 flex-1 pt-2 font-medium break-words'>
              {row.name}
            </p>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <p className='text-muted-foreground pt-2 text-sm'>
          and {rows.length - shown.length} more
        </p>
      )}
    </div>
  );
}

/** A person who comes back part-way lands on the first step with nothing in it; a plan with an income source and nothing else is where they stopped. */
const getFirstOpenStep = (
  incomeCount: number,
  billCount: number,
  spendingCount: number,
  hasStart: boolean,
): Step => {
  if (incomeCount === 0) return 'income';
  if (billCount === 0 && spendingCount === 0 && !hasStart) return 'bills';
  return 'income';
};

/** First run: one short question at a time. Only the income source is required; every other step has a Later. */
function StartingOutScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const { closeView, openDay } = useRunwayUrlState();
  const [form, setForm] = useState<{ name: FormName; key: number } | null>(
    null,
  );
  const incomeCount = useAppSelector(
    (state) =>
      state.runway.items.filter(
        (item) =>
          item.kind === 'payLine' &&
          item.archivedAt === null &&
          (item.endedAt === null || item.endedAt >= today),
      ).length,
  );
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const hasStart = useAppSelector(
    (state) => state.runway.plan?.startDate != null,
  );
  const { open } = useAppSelector((state) => selectListedDays(state, today));
  const nextDay = open.find((day) => day.status !== 'notArrived') ?? null;

  const [step, setStep] = useState<Step>(() =>
    getFirstOpenStep(
      incomeCount,
      bills.length,
      envelopes.length + goals.length,
      hasStart,
    ),
  );
  const index = STEPS.indexOf(step);
  const openForm = (name: FormName) =>
    setForm((current) => ({ name, key: (current?.key ?? 0) + 1 }));
  const closeForm = () => setForm(null);
  const goBack = () => (index === 0 ? closeView() : setStep(STEPS[index - 1]));
  const goNext = () => setStep(STEPS[index + 1]);

  const toRows = (
    list: {
      item: { id: string };
      version: { payload: { name: string; emoji: string | null } };
    }[],
  ) =>
    list.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      emoji: version.payload.emoji,
    }));

  const getBody = () => {
    if (step === 'income') {
      return {
        ask: START_WORDS.incomeAsk,
        help: START_WORDS.incomeHelp,
        content: (
          <>
            {incomeCount > 0 && (
              <p className='text-sm font-medium'>
                {incomeCount === 1
                  ? 'One income source added.'
                  : `${incomeCount} income sources added.`}
              </p>
            )}
            <Button
              variant={incomeCount > 0 ? 'secondary' : 'primary'}
              onClick={() => openForm('income')}
            >
              {incomeCount > 0 ? 'Add another' : 'Add an income source'}
            </Button>
          </>
        ),
        isDone: incomeCount > 0,
        isRequired: true,
      };
    }
    if (step === 'bills') {
      return {
        ask: START_WORDS.billsAsk,
        help: START_WORDS.billsHelp,
        content: (
          <>
            <AddedList
              rows={toRows(bills)}
              emptyIcon={<ReceiptText className='h-5 w-5' />}
              emptyText={START_WORDS.billsEmpty}
            />
            <Button
              variant={bills.length > 0 ? 'secondary' : 'primary'}
              onClick={() => openForm('bill')}
            >
              {bills.length > 0 ? 'Add another bill' : 'Add a bill'}
            </Button>
          </>
        ),
        isDone: bills.length > 0,
        isRequired: false,
      };
    }
    if (step === 'envelopes') {
      return {
        ask: START_WORDS.envelopesAsk,
        help: START_WORDS.envelopesHelp,
        content: (
          <>
            <AddedList
              rows={[...toRows(envelopes), ...toRows(goals)]}
              emptyIcon={<Mail className='h-5 w-5' />}
              emptyText={START_WORDS.envelopesEmpty}
            />
            <div className='flex flex-wrap gap-2'>
              <Button
                variant={envelopes.length > 0 ? 'secondary' : 'primary'}
                onClick={() => openForm('envelope')}
              >
                Add an envelope
              </Button>
              <Button variant='secondary' onClick={() => openForm('goal')}>
                Add a goal
              </Button>
            </div>
          </>
        ),
        isDone: envelopes.length + goals.length > 0,
        isRequired: false,
      };
    }
    if (step === 'stand') {
      return {
        ask: START_WORDS.standAsk,
        help: START_WORDS.standHelp,
        content: (
          <>
            {!hasStart && (
              <EmptyCard icon={<Wallet className='h-5 w-5' />}>
                {START_WORDS.standEmpty}
              </EmptyCard>
            )}
            <Button
              variant={hasStart ? 'secondary' : 'primary'}
              onClick={() => openForm('stand')}
            >
              {hasStart ? 'Change what you entered' : 'Say where things stand'}
            </Button>
          </>
        ),
        isDone: hasStart,
        isRequired: false,
      };
    }
    return {
      ask: START_WORDS.doneAsk,
      help: nextDay
        ? 'Open it to see what it sets aside, or go to Home.'
        : 'Go to Home to see where things stand.',
      content: nextDay ? (
        <ul className='border-border bg-card rounded-2xl border'>
          <IncomeDayCard
            day={nextDay}
            onOpen={() => {
              closeView();
              openDay(nextDay.dayKey);
            }}
          />
        </ul>
      ) : null,
      isDone: true,
      isRequired: false,
    };
  };

  const body = getBody();
  const isLast = step === 'done';

  return (
    <Subview
      overlay
      title={START_WORDS.title}
      onClose={closeView}
      onBack={goBack}
    >
      <div className='flex flex-1 flex-col gap-4'>
        <div className='space-y-1'>
          <p className='text-muted-foreground text-xs'>
            Step {index + 1} of {STEPS.length}
          </p>
          <h2 className='text-xl font-semibold text-balance'>{body.ask}</h2>
          <p className='text-muted-foreground text-sm text-pretty'>
            {body.help}
          </p>
        </div>
        <div className='space-y-3'>{body.content}</div>
        <ModalFooterActions
          note={
            body.isRequired && !body.isDone
              ? 'Add an income source to continue.'
              : null
          }
          cancelAction={
            index === 0 ? null : (
              <Button type='button' variant='secondary' onClick={goBack}>
                Back
              </Button>
            )
          }
          rightActions={
            isLast ? (
              <Button type='button' onClick={closeView}>
                {START_WORDS.done}
              </Button>
            ) : (
              <Button
                type='button'
                variant={body.isDone ? 'primary' : 'secondary'}
                disabled={body.isRequired && !body.isDone}
                onClick={goNext}
              >
                {body.isDone || body.isRequired
                  ? START_WORDS.next
                  : START_WORDS.later}
              </Button>
            )
          }
        />
      </div>
      {form?.name === 'income' && (
        <IncomeForm
          key={form.key}
          isOpen
          title='Income source'
          defaultFrequency={null}
          onClose={closeForm}
        />
      )}
      {form?.name === 'bill' && (
        <BillForm key={form.key} isOpen title='Bill' onClose={closeForm} />
      )}
      {form?.name === 'envelope' && (
        <EnvelopeForm
          key={form.key}
          isOpen
          title='Envelope'
          onClose={closeForm}
        />
      )}
      {form?.name === 'goal' && (
        <GoalForm key={form.key} isOpen title='Goal' onClose={closeForm} />
      )}
      {form?.name === 'stand' && (
        <StartingAmountsSheet key={form.key} isOpen onClose={closeForm} />
      )}
    </Subview>
  );
}

export default StartingOutScreen;
