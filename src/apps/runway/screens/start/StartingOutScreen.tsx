import { HardDrive, Wallet } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EmptyCard from '@/components/EmptyCard';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import IncomeDayCard from '@apps/runway/components/IncomeDayCard';
import { BUDGET_WORDS, START_WORDS } from '@apps/runway/constants';
import { collectStarted } from '@apps/runway/engine/progress';
import InlineNotice from '@/components/InlineNotice';
import StartRowList from '@apps/runway/screens/start/StartRowList';
import type { StartRow } from '@apps/runway/screens/start/startRows';
import { formatCentsShort } from '@/utils/moneyUtils';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import StartingAmountsSheet from '@apps/runway/forms/StartingAmountsSheet';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { toDraftSourceId } from '@apps/runway/forms/fundingFlow';
import StartFlow, {
  type StartFormState,
  type StartKind,
} from '@apps/runway/screens/start/StartFlow';
import {
  describeCounts,
  toBillRow,
  toEnvelopeRow,
  toGoalRow,
  toIncomeRows,
} from '@apps/runway/screens/start/startRows';
import {
  commitStartDraft,
  DraftPartialWrite,
  toTopRanks,
  type ExistingNames,
} from '@apps/runway/store/actions/draftActions';
import { archiveItem } from '@apps/runway/store/actions/itemActions';
import type { HeldChoice } from '@apps/runway/engine/endings';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectIsPlanItemsLoaded,
  selectListedDays,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  addDraftEntries,
  clearStartDraft,
  removeDraftEntry,
  saveDraftEntry,
  saveDraftStep,
  useStartDraft,
  EMPTY_START_DRAFT,
  type DraftKind,
  type StartDraft,
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
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const hasStart = useAppSelector(
    (state) => state.runway.plan?.startDate != null,
  );
  const moves = useAppSelector((state) => state.runway.moves);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const started = collectStarted(moves, startDate);
  const standRows: StartRow[] = [
    ...(started.money === null || started.money === undefined
      ? []
      : [
          {
            id: 'money',
            name: 'Money on hand',
            emoji: null,
            line: 'What you have to plan with',
            amount: formatCentsShort(started.money),
          },
        ]),
    ...[...bills, ...goals].flatMap(({ item, version }) =>
      started.byItem[item.id] === undefined
        ? []
        : [
            {
              id: item.id,
              name: version.payload.name,
              emoji: version.payload.emoji,
              line: item.kind === 'bill' ? 'Already set aside' : 'In it now',
              amount: formatCentsShort(started.byItem[item.id]),
            },
          ],
    ),
  ];
  const { open } = useAppSelector((state) => selectListedDays(state, today));
  const nextDay = open.find((day) => day.status !== 'notArrived') ?? null;

  const payLines = sources.flatMap((source) =>
    source.payLines.map((line) => ({ source, line })),
  );
  const rows = {
    income: toIncomeRows(
      payLines.map(({ source, line }) => ({
        id: line.item.id,
        sourceName: source.version.payload.name,
        payLineName: line.version.payload.name,
        amount: line.version.payload.amount,
        schedule: line.version.payload.schedule,
      })),
    ),
    bill: bills.map(({ item, version }) => toBillRow(item.id, version.payload)),
    envelope: envelopes.map(({ item, version }) =>
      toEnvelopeRow(item.id, version.payload),
    ),
    goal: goals.map(({ item, version }) => toGoalRow(item.id, version.payload)),
  };
  const counts = {
    income: new Set(rows.income.map((row) => row.group ?? row.id)).size,
    bill: rows.bill.length,
    envelope: rows.envelope.length,
    goal: rows.goal.length,
  };

  const assignedByItem = useAppSelector(
    (state) => selectBalances(state).assignedByItem,
  );
  const getHeldCents = (kind: StartKind, id: string) =>
    kind === 'income' ? 0 : Math.max(assignedByItem[id] ?? 0, 0);

  const archive = async (
    itemId: string,
    name: string,
    heldChoice: HeldChoice | null = null,
  ) => {
    const encryption = await getRunwayEncryption(uid);
    const holds = (assignedByItem[itemId] ?? 0) > 0;
    await archiveItem(
      uid,
      encryption,
      {
        itemId,
        summary: `Removed ${name}.`,
        note: null,
        heldChoice: holds ? (heldChoice ?? 'keep') : 'free',
      },
      today,
    );
  };

  const remove = async (
    kind: StartKind,
    id: string,
    heldChoice: HeldChoice | null,
  ) => {
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
    if (found) await archive(id, found.version.payload.name, heldChoice);
  };

  const startOver = async (heldChoice: HeldChoice | null) => {
    await Promise.all([
      ...payLines.map(({ line, source }) =>
        archive(line.item.id, source.version.payload.name),
      ),
      ...sources.map((source) =>
        archive(source.item.id, source.version.payload.name),
      ),
      ...[...bills, ...envelopes, ...goals].map(({ item, version }) =>
        archive(item.id, version.payload.name, heldChoice),
      ),
    ]);
  };

  const { addToast } = useToast();
  const items = useAppSelector((state) => state.runway.items);
  const addBudget = async (draft: Pick<StartDraft, DraftKind>) => {
    const existing: ExistingNames = {
      sources: sources.map((source) => source.version.payload.name),
      bills: bills.map(({ version }) => version.payload.name),
      envelopes: envelopes.map(({ version }) => version.payload.name),
      goals: goals.map(({ version }) => version.payload.name),
      topRanks: {
        bills: toTopRanks(bills),
        envelopes: toTopRanks(envelopes),
        goals: toTopRanks(goals),
      },
      startDate,
      itemCount: items.length,
    };
    const encryption = await getRunwayEncryption(uid);
    const warnUnrecorded = (names: string[]) => {
      if (names.length > 0)
        addToast({
          title: START_WORDS.handoffUnrecorded(names.join(', ')),
          type: 'warning',
        });
    };
    const { added, unrecordedHoldings } = await commitStartDraft(
      uid,
      encryption,
      { ...EMPTY_START_DRAFT, ...draft },
      existing,
      today,
    ).catch((error: unknown) => {
      if (error instanceof DraftPartialWrite)
        warnUnrecorded(error.result.unrecordedHoldings);
      throw error;
    });
    addToast({ title: START_WORDS.handoffSaved(added), type: 'success' });
    warnUnrecorded(unrecordedHoldings);
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
      budget={{ mode: 'plan', onAdd: addBudget }}
      steps={SAVED_STEPS}
      rows={rows}
      resumeStep={getFirstOpenStep(counts, hasStart)}
      renderForm={renderForm}
      isStandDone={hasStart}
      standContent={(openStand) => (
        <>
          {bills.length + goals.length >= STAND_MANY && (
            <InlineNotice tone='info'>{START_WORDS.standMany}</InlineNotice>
          )}
          {!hasStart && (
            <EmptyCard icon={<Wallet className='h-5 w-5' />}>
              {START_WORDS.standEmpty}
            </EmptyCard>
          )}
          <StartRowList
            rows={standRows}
            searchLabel='Search what you entered'
            onOpen={openStand}
          />
          <Button
            variant={hasStart ? 'secondary' : 'primary'}
            onClick={openStand}
          >
            {hasStart ? 'Change what you entered' : 'Say where things stand'}
          </Button>
        </>
      )}
      doneAsk={START_WORDS.doneAsk}
      doneHelp='Go to Home to see where things stand.'
      doneContent={() => (
        <>
          <p className='text-sm text-pretty'>
            {START_WORDS.savedSummary(describeCounts(counts))}
          </p>
          {nextDay && (
            <ul className='border-border bg-card rounded-2xl border'>
              <IncomeDayCard day={nextDay} lead='Next income day' />
            </ul>
          )}
        </>
      )}
      remove={remove}
      startOver={startOver}
      startOverMessage={START_WORDS.startOverPlan}
      getHeldCents={getHeldCents}
    />
  );
}

/** Starting out before signing in: answers are kept on this device for a week and written to the plan on sign-in. */
function DeviceStart() {
  const { signInWithGoogle } = useAuth();
  const { addToast } = useToast();
  const draft = useStartDraft();
  const entries = {
    incomes: draft?.incomes ?? [],
    bills: draft?.bills ?? [],
    envelopes: draft?.envelopes ?? [],
    goals: draft?.goals ?? [],
  };
  const draftSources = [
    ...new Map(
      entries.incomes.map(({ value }) => [
        toDraftSourceId(value.sourceName),
        { id: toDraftSourceId(value.sourceName), name: value.sourceName },
      ]),
    ).values(),
  ];
  const rows = {
    income: toIncomeRows(
      entries.incomes.map(({ id, value }) => ({
        id,
        sourceName: value.sourceName,
        payLineName: value.payLineName,
        amount: value.amount,
        schedule: value.schedule,
      })),
    ),
    bill: entries.bills.map(({ id, value }) => toBillRow(id, value)),
    envelope: entries.envelopes.map(({ id, value }) =>
      toEnvelopeRow(id, value),
    ),
    goal: entries.goals.map(({ id, value }) => toGoalRow(id, value)),
  };

  const counts = {
    income: new Set(rows.income.map((row) => row.group ?? row.id)).size,
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
            sources: draftSources,
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
          sources: draftSources,
        }}
        onClose={close}
      />
    );
  };

  return (
    <StartFlow
      budget={{
        mode: 'device',
        onAdd: async (added) => {
          addDraftEntries(added);
          addToast({
            title: BUDGET_WORDS.addedToast(
              added.incomes.length +
                added.bills.length +
                added.envelopes.length +
                added.goals.length,
            ),
            type: 'success',
          });
        },
      }}
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
      doneContent={() => (
        <div className='border-border bg-muted/50 flex items-start gap-3 rounded-2xl border p-3'>
          <HardDrive
            className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <p className='text-sm text-pretty'>
            {START_WORDS.saveSummary(describeCounts(counts))}
          </p>
        </div>
      )}
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
