import { HardDrive, Wallet } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { START_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import StartFlow, {
  type StartFormState,
  type StartKind,
} from '@apps/runway/screens/start/StartFlow';
import {
  describeCounts,
  toBillRow,
  toEnvelopeRow,
  toGoalRow,
  toIncomeRow,
} from '@apps/runway/screens/start/startRows';
import { archiveItem } from '@apps/runway/store/actions/itemActions';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectIsPlanItemsLoaded,
  selectListedDays,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  clearStartDraft,
  removeDraftEntry,
  saveDraftEntry,
  saveDraftStep,
  useStartDraft,
  type DraftKind,
  type StartStep,
} from '@apps/runway/utils/startDraft';

const SAVED_STEPS: readonly StartStep[] = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'stand',
  'done',
];
const DRAFT_STEPS: readonly StartStep[] = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'done',
];

const STAND_MANY = 8;

const DRAFT_KINDS: Record<StartKind, DraftKind> = {
  income: 'incomes',
  bill: 'bills',
  envelope: 'envelopes',
  goal: 'goals',
};

/** A person who comes back part-way lands on the first step with nothing in it. */
const getFirstOpenStep = (
  counts: Record<StartKind, number>,
  hasStart: boolean,
): StartStep => {
  if (counts.income === 0) return 'income';
  if (counts.bill === 0) return 'bills';
  if (counts.envelope === 0) return 'envelopes';
  if (counts.goal === 0) return 'goals';
  return hasStart ? 'done' : 'stand';
};

/** Starting out for someone with a plan: every answer is written to it as it is given. */
function SavedStart({ uid }: { uid: string }) {
  const today = todayAsUtcDate(useNow(60_000));
  const { closeView, openDay } = useRunwayUrlState();
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const hasStart = useAppSelector(
    (state) => state.runway.plan?.startDate != null,
  );
  const { open } = useAppSelector((state) => selectListedDays(state, today));
  const nextDay = open.find((day) => day.status !== 'notArrived') ?? null;

  const payLines = sources.flatMap((source) =>
    source.payLines.map((line) => ({ source, line })),
  );
  const rows = {
    income: payLines.map(({ source, line }) =>
      toIncomeRow(
        line.item.id,
        source.version.payload.name,
        line.version.payload.amount,
        line.version.payload.schedule,
      ),
    ),
    bill: bills.map(({ item, version }) => toBillRow(item.id, version.payload)),
    envelope: envelopes.map(({ item, version }) =>
      toEnvelopeRow(item.id, version.payload),
    ),
    goal: goals.map(({ item, version }) => toGoalRow(item.id, version.payload)),
  };
  const counts = {
    income: rows.income.length,
    bill: rows.bill.length,
    envelope: rows.envelope.length,
    goal: rows.goal.length,
  };

  const archive = async (itemId: string, name: string) => {
    const encryption = await getRunwayEncryption(uid);
    await archiveItem(
      uid,
      encryption,
      { itemId, summary: `Removed ${name}.`, note: null },
      today,
    );
  };

  const remove = async (kind: StartKind, id: string) => {
    if (kind === 'income') {
      const found = payLines.find(({ line }) => line.item.id === id);
      if (!found) return;
      await archive(id, found.source.version.payload.name);
      if (found.source.payLines.length === 1) {
        await archive(found.source.item.id, found.source.version.payload.name);
      }
      return;
    }
    const list =
      kind === 'bill' ? bills : kind === 'envelope' ? envelopes : goals;
    const found = list.find(({ item }) => item.id === id);
    if (found) await archive(id, found.version.payload.name);
  };

  const startOver = async () => {
    await Promise.all([
      ...payLines.map(({ line, source }) =>
        archive(line.item.id, source.version.payload.name),
      ),
      ...sources.map((source) =>
        archive(source.item.id, source.version.payload.name),
      ),
      ...[...bills, ...envelopes, ...goals].map(({ item, version }) =>
        archive(item.id, version.payload.name),
      ),
    ]);
  };

  const renderForm = (form: StartFormState, close: () => void) => {
    const id = form.entryId;
    if (form.name === 'income') {
      const found = payLines.find(({ line }) => line.item.id === id);
      return (
        <IncomeForm
          key={form.key}
          isOpen
          title='Income source'
          defaultFrequency={null}
          editing={
            found
              ? {
                  itemId: found.line.item.id,
                  kind: 'payLine',
                  payload: found.line.version.payload,
                }
              : undefined
          }
          onClose={close}
        />
      );
    }
    if (form.name === 'bill') {
      const found = bills.find(({ item }) => item.id === id);
      return (
        <BillForm
          key={form.key}
          isOpen
          title='Bill'
          editing={
            found
              ? { itemId: found.item.id, payload: found.version.payload }
              : undefined
          }
          onClose={close}
        />
      );
    }
    if (form.name === 'envelope') {
      const found = envelopes.find(({ item }) => item.id === id);
      return (
        <EnvelopeForm
          key={form.key}
          isOpen
          title='Envelope'
          editing={
            found
              ? { itemId: found.item.id, payload: found.version.payload }
              : undefined
          }
          onClose={close}
        />
      );
    }
    if (form.name === 'goal') {
      const found = goals.find(({ item }) => item.id === id);
      return (
        <GoalForm
          key={form.key}
          isOpen
          title='Goal'
          editing={
            found
              ? { itemId: found.item.id, payload: found.version.payload }
              : undefined
          }
          onClose={close}
        />
      );
    }
    return <StartingAmountsSheet key={form.key} isOpen onClose={close} />;
  };

  return (
    <StartFlow
      steps={SAVED_STEPS}
      rows={rows}
      resumeStep={getFirstOpenStep(counts, hasStart)}
      renderForm={renderForm}
      isStandDone={hasStart}
      standContent={(openStand) => (
        <>
          {bills.length + goals.length >= STAND_MANY && (
            <p className='text-muted-foreground text-sm text-pretty'>
              {START_WORDS.standMany}
            </p>
          )}
          {!hasStart && (
            <EmptyCard icon={<Wallet className='h-5 w-5' />}>
              {START_WORDS.standEmpty}
            </EmptyCard>
          )}
          <Button
            variant={hasStart ? 'secondary' : 'primary'}
            onClick={openStand}
          >
            {hasStart ? 'Change what you entered' : 'Say where things stand'}
          </Button>
        </>
      )}
      doneAsk={START_WORDS.doneAsk}
      doneHelp={
        nextDay
          ? 'Open it to see what it sets aside, or go to Home.'
          : 'Go to Home to see where things stand.'
      }
      doneContent={
        nextDay ? (
          <ul className='border-border bg-card rounded-2xl border'>
            <IncomeDayCard
              day={nextDay}
              onOpen={() => {
                closeView();
                openDay(nextDay.dayKey);
              }}
            />
          </ul>
        ) : null
      }
      remove={remove}
      startOver={startOver}
      startOverMessage={START_WORDS.startOverPlan}
    />
  );
}

/** Starting out before signing in: answers are kept on this device for a week and written to the plan on sign-in. */
function DeviceStart() {
  const { signInWithGoogle } = useAuth();
  const draft = useStartDraft();
  const entries = {
    incomes: draft?.incomes ?? [],
    bills: draft?.bills ?? [],
    envelopes: draft?.envelopes ?? [],
    goals: draft?.goals ?? [],
  };
  const rows = {
    income: entries.incomes.map(({ id, value }) =>
      toIncomeRow(id, value.sourceName, value.amount, value.schedule),
    ),
    bill: entries.bills.map(({ id, value }) => toBillRow(id, value)),
    envelope: entries.envelopes.map(({ id, value }) =>
      toEnvelopeRow(id, value),
    ),
    goal: entries.goals.map(({ id, value }) => toGoalRow(id, value)),
  };

  const counts = {
    income: rows.income.length,
    bill: rows.bill.length,
    envelope: rows.envelope.length,
    goal: rows.goal.length,
  };

  const remove = async (kind: StartKind, id: string) =>
    removeDraftEntry(DRAFT_KINDS[kind], id);

  const renderForm = (form: StartFormState, close: () => void) => {
    const id = form.entryId;
    if (form.name === 'income') {
      return (
        <IncomeForm
          key={form.key}
          isOpen
          title='Income source'
          defaultFrequency={null}
          draft={{
            initial:
              entries.incomes.find((entry) => entry.id === id)?.value ?? null,
            onSave: (value) => saveDraftEntry('incomes', value, id),
          }}
          onClose={close}
        />
      );
    }
    if (form.name === 'bill') {
      return (
        <BillForm
          key={form.key}
          isOpen
          title='Bill'
          draft={{
            initial:
              entries.bills.find((entry) => entry.id === id)?.value ?? null,
            onSave: (value) => saveDraftEntry('bills', value, id),
          }}
          onClose={close}
        />
      );
    }
    if (form.name === 'envelope') {
      return (
        <EnvelopeForm
          key={form.key}
          isOpen
          title='Envelope'
          draft={{
            initial:
              entries.envelopes.find((entry) => entry.id === id)?.value ?? null,
            onSave: (value) => saveDraftEntry('envelopes', value, id),
          }}
          onClose={close}
        />
      );
    }
    return (
      <GoalForm
        key={form.key}
        isOpen
        title='Goal'
        draft={{
          initial:
            entries.goals.find((entry) => entry.id === id)?.value ?? null,
          onSave: (value) => saveDraftEntry('goals', value, id),
        }}
        onClose={close}
      />
    );
  };

  return (
    <StartFlow
      steps={DRAFT_STEPS}
      rows={rows}
      resumeStep={draft?.step ?? 'income'}
      onStepChange={(step) => {
        if (draft) saveDraftStep(step);
      }}
      notice={
        <div className='border-border bg-muted/50 flex items-start gap-3 rounded-2xl border p-3'>
          <HardDrive
            className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <p className='text-sm text-pretty'>{START_WORDS.localNotice}</p>
        </div>
      }
      renderForm={renderForm}
      doneAsk={START_WORDS.saveAsk}
      doneHelp={START_WORDS.saveBody}
      doneContent={
        <div className='border-border bg-muted/50 flex items-start gap-3 rounded-2xl border p-3'>
          <HardDrive
            className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <p className='text-sm text-pretty'>
            {START_WORDS.saveSummary(describeCounts(counts))}
          </p>
        </div>
      }
      doneAction={
        <Button type='button' onClick={() => void signInWithGoogle()}>
          {START_WORDS.saveButton}
        </Button>
      }
      remove={remove}
      startOver={async () => clearStartDraft()}
      startOverMessage={START_WORDS.startOverLocal}
    />
  );
}

function StartingOutScreen() {
  const { user } = useAuth();
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  if (!user) return <DeviceStart />;
  if (!isLoaded) {
    return (
      <div className='page'>
        <div className='mx-auto max-w-4xl py-6'>
          <EmptyCard icon={<Wallet className='h-5 w-5' />}>
            Getting your plan ready.
          </EmptyCard>
        </div>
      </div>
    );
  }
  return <SavedStart uid={user.uid} />;
}

export default StartingOutScreen;
