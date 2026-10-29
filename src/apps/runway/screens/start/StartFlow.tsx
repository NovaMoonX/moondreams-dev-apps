import { useRef, useState, type ReactNode } from 'react';
import {
  CircleHelp,
  FileText,
  ListChecks,
  Mail,
  Pencil,
  ReceiptText,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import EmptyCard from '@/components/EmptyCard';
import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import MethodPicker from '@/components/MethodPicker';
import {
  BUDGET_WORDS,
  START_HELD_WORDS,
  START_WORDS,
} from '@apps/runway/constants';
import BudgetStart, {
  type BudgetGuards,
} from '@apps/runway/screens/start/BudgetStart';
import HeldChoiceList from '@apps/runway/components/HeldChoiceList';
import type { HeldChoice } from '@apps/runway/engine/endings';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { formatCents } from '@/utils/moneyUtils';
import StartRowList from '@apps/runway/screens/start/StartRowList';
import {
  describeCounts,
  type StartRow,
} from '@apps/runway/screens/start/startRows';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type {
  DraftKind,
  StartDraft,
  StartStep,
} from '@apps/runway/utils/startDraft';

export type StartKind = 'income' | 'bill' | 'envelope' | 'goal';
export type StartFormName = StartKind | 'stand';
export interface StartFormState {
  name: StartFormName;
  /** The entry being changed; null adds a new one. */
  entryId: string | null;
  key: number;
}

const KIND_ORDER: StartKind[] = ['income', 'bill', 'envelope', 'goal'];

const KIND_WORDS: Record<
  StartKind,
  {
    step: StartStep;
    ask: string;
    help: string | null;
    add: string;
    addAnother: string;
    search: string;
    empty: string | null;
    noun: [string, string];
  }
> = {
  income: {
    step: 'income',
    ask: START_WORDS.incomeAsk,
    help: START_WORDS.incomeHelp,
    add: START_WORDS.addIncome,
    addAnother: START_WORDS.addAnotherIncome,
    search: 'Search your income',
    empty: null,
    noun: ['income source', 'income sources'],
  },
  bill: {
    step: 'bills',
    ask: START_WORDS.billsAsk,
    help: START_WORDS.billsHelp,
    add: START_WORDS.addBill,
    addAnother: START_WORDS.addAnotherBill,
    search: 'Search your bills',
    empty: START_WORDS.billsEmpty,
    noun: ['bill', 'bills'],
  },
  envelope: {
    step: 'envelopes',
    ask: START_WORDS.envelopesAsk,
    help: null,
    add: START_WORDS.addEnvelope,
    addAnother: START_WORDS.addAnotherEnvelope,
    search: 'Search your envelopes',
    empty: START_WORDS.envelopesEmpty,
    noun: ['envelope', 'envelopes'],
  },
  goal: {
    step: 'goals',
    ask: START_WORDS.goalsAsk,
    help: START_WORDS.goalsHelp,
    add: START_WORDS.addGoal,
    addAnother: START_WORDS.addAnotherGoal,
    search: 'Search your goals',
    empty: START_WORDS.goalsEmpty,
    noun: ['goal', 'goals'],
  },
};

const EMPTY_ICONS: Record<StartKind, ReactNode> = {
  income: <Wallet className='h-5 w-5' />,
  bill: <ReceiptText className='h-5 w-5' />,
  envelope: <Mail className='h-5 w-5' />,
  goal: <Target className='h-5 w-5' />,
};

interface StartFlowProps {
  steps: readonly StartStep[];
  rows: Record<StartKind, StartRow[]>;
  /** Shown over the first step, for a person with no account yet. */
  notice?: ReactNode;
  /** Where "Continue where you left off" lands. */
  resumeStep: StartStep;
  onStepChange?: (step: StartStep) => void;
  renderForm: (form: StartFormState, close: () => void) => ReactNode;
  /** The step after goals, which only a saved plan has. */
  standContent?: (openStand: () => void) => ReactNode;
  isStandDone?: boolean;
  doneAsk: string;
  doneHelp: string;
  /** The step's body; `finish` leaves Starting out and then runs what it is given. */
  doneContent: (finish: (then?: () => void) => void) => ReactNode;
  /** Replaces the final Done button, for the step that asks for a sign-in. */
  doneAction?: ReactNode;
  /** What a removed entry's choice is for the money it holds; null when it holds none. */
  remove: (
    kind: StartKind,
    id: string,
    heldChoice: HeldChoice | null,
  ) => Promise<void>;
  startOver: (heldChoice: HeldChoice | null) => Promise<void>;
  /** The money an entry holds, in cents; entries on this device hold none. */
  getHeldCents?: (kind: StartKind, id: string) => number;
  startOverMessage: (parts: string) => string;
  /** On the title line, such as the eye that shows or hides private figures. */
  headerAction?: ReactNode;
  /** Offers "Start from your budget" beside starting fresh when nothing has been added yet. */
  budget?: {
    mode: 'plan' | 'device';
    onAdd: (draft: Pick<StartDraft, DraftKind>) => Promise<void>;
  };
}

/** Starting out, one short question at a time. Only the income source is required; every other step has a Later. */
function StartFlow({
  steps,
  rows,
  notice,
  resumeStep,
  onStepChange,
  renderForm,
  standContent,
  isStandDone = false,
  doneAsk,
  doneHelp,
  doneContent,
  doneAction,
  remove,
  startOver,
  startOverMessage,
  headerAction,
  getHeldCents,
  budget,
}: StartFlowProps) {
  const { closeView } = useRunwayUrlState();
  const { confirm } = useActionModal();
  const counts = {
    income: new Set(rows.income.map((row) => row.group ?? row.id)).size,
    bill: rows.bill.length,
    envelope: rows.envelope.length,
    goal: rows.goal.length,
  };
  const total = counts.income + counts.bill + counts.envelope + counts.goal;
  const [isAsking, setIsAsking] = useState(total > 0);
  const [stage, setStage] = useState<'choose' | 'budget' | 'steps'>(
    total === 0 && budget ? 'choose' : 'steps',
  );
  const [step, setStep] = useState<StartStep>(
    steps.includes(resumeStep) ? resumeStep : steps[0],
  );
  const [form, setForm] = useState<StartFormState | null>(null);
  const [selected, setSelected] = useState<{
    kind: StartKind;
    id: string;
  } | null>(null);
  const budgetGuards = useRef<BudgetGuards | null>(null);
  const [isEnvelopeHelpOpen, setIsEnvelopeHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heldAsk, setHeldAsk] = useState<
    | { kind: 'remove'; name: string; entry: { kind: StartKind; id: string } }
    | { kind: 'startOver' }
    | null
  >(null);
  const [heldChoice, setHeldChoice] = useState<HeldChoice | null>(null);
  const [isHeldSaving, setIsHeldSaving] = useState(false);
  const holdings = KIND_ORDER.flatMap((kind) =>
    rows[kind]
      .map((row) => getHeldCents?.(kind, row.id) ?? 0)
      .filter((cents) => cents > 0),
  );
  const heldTotal = holdings.reduce((sum, cents) => sum + cents, 0);
  const index = steps.indexOf(step);

  const openForm = (name: StartFormName, entryId: string | null = null) =>
    setForm((current) => ({ name, entryId, key: (current?.key ?? 0) + 1 }));
  const closeForm = () => setForm(null);
  const goTo = (next: StartStep) => {
    setStep(next);
    onStepChange?.(next);
  };
  const [isLeaving, setIsLeaving] = useState(false);
  const leave = (then?: () => void) => {
    if (then) {
      closeView();
      then();
      return;
    }
    if (!window.history.state?.backLayerKey) {
      closeView();
      return;
    }
    setIsLeaving(true);
    window.history.back();
  };
  /** The step after the last kind that now has entries, so the person lands on what is still empty; the last step when every kind is filled. */
  const getStepAfterAdding = (draft: Pick<StartDraft, DraftKind>) => {
    const filled: Record<StartKind, boolean> = {
      income: counts.income + draft.incomes.length > 0,
      bill: counts.bill + draft.bills.length > 0,
      envelope: counts.envelope + draft.envelopes.length > 0,
      goal: counts.goal + draft.goals.length > 0,
    };
    const last = KIND_ORDER.filter((kind) => filled[kind]).pop();
    const lastIndex =
      last === undefined ? -1 : steps.indexOf(KIND_WORDS[last].step);
    return steps[Math.min(lastIndex + 1, steps.length - 1)];
  };
  const goBack = () => (index === 0 ? leave() : goTo(steps[index - 1]));
  const goNext = () => goTo(steps[index + 1]);

  const selectedRow =
    selected === null
      ? null
      : (rows[selected.kind].find((row) => row.id === selected.id) ?? null);

  const askHeld = (ask: NonNullable<typeof heldAsk>) => {
    setHeldChoice(null);
    setError(null);
    setHeldAsk(ask);
  };

  const runHeld = async () => {
    if (!heldAsk || heldChoice === null || isHeldSaving) return;
    setIsHeldSaving(true);
    setError(null);
    try {
      if (heldAsk.kind === 'remove') {
        await remove(heldAsk.entry.kind, heldAsk.entry.id, heldChoice);
      } else {
        await startOver(heldChoice);
        setIsAsking(false);
        setStep(steps[0]);
        if (budget) setStage('choose');
      }
      setHeldAsk(null);
    } catch {
      setError(START_WORDS.removeFailed);
    } finally {
      setIsHeldSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!selected || !selectedRow) return;
    const held = getHeldCents?.(selected.kind, selected.id) ?? 0;
    if (held > 0) {
      setSelected(null);
      askHeld({ kind: 'remove', name: selectedRow.name, entry: selected });
      return;
    }
    const isConfirmed = await confirm({
      title: START_WORDS.removeTitle(selectedRow.name),
      message: START_WORDS.removeMessage,
      confirmText: START_WORDS.rowActionsRemove,
      destructive: true,
    });
    if (!isConfirmed) return;
    setError(null);
    try {
      await remove(selected.kind, selected.id, null);
      setSelected(null);
    } catch {
      setError(START_WORDS.removeFailed);
    }
  };

  const handleStartOver = async () => {
    if (heldTotal > 0) {
      askHeld({ kind: 'startOver' });
      return;
    }
    const parts = describeCounts(counts);
    const isConfirmed = await confirm({
      title: START_WORDS.startOverTitle,
      message: startOverMessage(parts),
      confirmText: START_WORDS.startOverConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    setError(null);
    try {
      await startOver(null);
      setIsAsking(false);
      setStep(steps[0]);
      if (budget) setStage('choose');
    } catch {
      setError(START_WORDS.removeFailed);
    }
  };

  const getKindBody = (kind: StartKind) => {
    const words = KIND_WORDS[kind];
    const list = rows[kind];
    return {
      ask: words.ask,
      help: words.help,
      content: (
        <>
          {list.length === 0 && words.empty && (
            <EmptyCard icon={EMPTY_ICONS[kind]}>{words.empty}</EmptyCard>
          )}
          <StartRowList
            rows={list}
            searchLabel={words.search}
            onOpen={(id) => setSelected({ kind, id })}
          />
          <Button
            variant={list.length > 0 ? 'secondary' : 'primary'}
            onClick={() => openForm(kind)}
          >
            {list.length > 0 ? words.addAnother : words.add}
          </Button>
          {kind === 'envelope' && (
            <Button
              variant='tertiary'
              size='sm'
              className='text-muted-foreground! relative -ml-2 gap-1.5 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[""]'
              onClick={() => setIsEnvelopeHelpOpen(true)}
            >
              <CircleHelp className='h-4 w-4' aria-hidden='true' />
              {START_WORDS.envelopeDoor}
            </Button>
          )}
        </>
      ),
      isDone: list.length > 0,
      isRequired: kind === 'income',
    };
  };

  const getBody = () => {
    const kind = KIND_ORDER.find((entry) => KIND_WORDS[entry].step === step);
    if (kind) return getKindBody(kind);
    if (step === 'stand') {
      return {
        ask: START_WORDS.standAsk,
        help: START_WORDS.standHelp,
        content: standContent?.(() => openForm('stand')),
        isDone: isStandDone,
        isRequired: false,
      };
    }
    return {
      ask: doneAsk,
      help: doneHelp,
      content: doneContent(leave),
      isDone: true,
      isRequired: false,
    };
  };

  const body = getBody();
  const isLast = step === 'done';

  const asking = (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='space-y-1'>
        <h2 className='text-2xl font-semibold text-balance'>
          {START_WORDS.resumeAsk}
        </h2>
        <p className='text-muted-foreground text-sm text-pretty'>
          {START_WORDS.resumeSummary(describeCounts(counts))}
        </p>
      </div>
      <div className='flex flex-col gap-2'>
        <Button onClick={() => setIsAsking(false)}>
          {START_WORDS.resumeContinue}
        </Button>
        <Button variant='secondary' onClick={() => void handleStartOver()}>
          {START_WORDS.resumeStartOver}
        </Button>
      </div>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );

  if (stage !== 'steps' && budget) {
    return (
      <Subview
        overlay
        title={START_WORDS.title}
        onClose={() =>
          stage === 'budget' && budgetGuards.current
            ? budgetGuards.current.close()
            : closeView()
        }
        headerAction={headerAction ?? <ValuesEyeButton />}
        onBack={() => {
          if (stage !== 'budget') leave();
          else if (budgetGuards.current) budgetGuards.current.back();
          else setStage('choose');
        }}
      >
        {stage === 'choose' ? (
          <div className='flex flex-1 flex-col gap-4'>
            <h2 className='text-2xl font-semibold text-balance'>
              {BUDGET_WORDS.chooseAsk}
            </h2>
            <MethodPicker
              methods={[
                {
                  id: 'budget',
                  emoji: <FileText className='h-5 w-5' />,
                  title: BUDGET_WORDS.methodTitle,
                  description: BUDGET_WORDS.methodBody,
                  onPick: () => setStage('budget'),
                },
                {
                  id: 'fresh',
                  emoji: <ListChecks className='h-5 w-5' />,
                  title: BUDGET_WORDS.freshTitle,
                  description: BUDGET_WORDS.freshBody,
                  onPick: () => setStage('steps'),
                },
              ]}
            />
          </div>
        ) : (
          <BudgetStart
            mode={budget.mode}
            onBack={() => setStage('choose')}
            onExit={closeView}
            onStartFresh={() => setStage('steps')}
            onGuards={(guards) => {
              budgetGuards.current = guards;
            }}
            onAdd={async (draft) => {
              await budget.onAdd(draft);
              setStage('steps');
              goTo(getStepAfterAdding(draft));
            }}
          />
        )}
      </Subview>
    );
  }

  return (
    <Subview
      overlay
      title={START_WORDS.title}
      onClose={closeView}
      headerAction={headerAction ?? <ValuesEyeButton />}
      onBack={() => {
        if (isLeaving) closeView();
        else if (isAsking) leave();
        else goBack();
      }}
    >
      {isAsking ? (
        asking
      ) : (
        <div className='flex flex-1 flex-col gap-4'>
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs'>
              {START_WORDS.stepOf(index + 1, steps.length)}
            </p>
            <h2 className='text-2xl font-semibold text-balance'>{body.ask}</h2>
            {body.help && (
              <p className='text-muted-foreground text-sm text-pretty'>
                {body.help}
              </p>
            )}
          </div>
          {index === 0 && notice}
          <div className='space-y-3'>{body.content}</div>
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
          <ModalFooterActions
            note={
              body.isRequired && !body.isDone ? START_WORDS.needIncome : null
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
                (doneAction ?? (
                  <Button type='button' onClick={() => leave()}>
                    {START_WORDS.done}
                  </Button>
                ))
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
      )}
      {form && renderForm(form, closeForm)}
      <DetailSheet
        isOpen={selected !== null && selectedRow !== null}
        onClose={() => setSelected(null)}
        title={selectedRow?.name ?? ''}
      >
        <ActionGroup isRoomy>
          <ActionRow
            isGrouped
            isRoomy
            icon={<Pencil className='h-5 w-5' />}
            label={START_WORDS.rowActionsChange}
            hasChevron
            onClick={() => {
              if (!selected) return;
              const { kind, id } = selected;
              setSelected(null);
              openForm(kind, id);
            }}
          />
          <ActionRow
            isGrouped
            isRoomy
            isDestructive
            icon={<Trash2 className='h-5 w-5' />}
            label={START_WORDS.rowActionsRemove}
            onClick={() => void handleRemove()}
          />
        </ActionGroup>
        {error && (
          <p className='text-destructive pt-2 text-sm' role='alert'>
            {error}
          </p>
        )}
      </DetailSheet>
      <DetailSheet
        isOpen={heldAsk !== null}
        onClose={() => {
          if (!isHeldSaving) setHeldAsk(null);
        }}
        title={
          heldAsk?.kind === 'remove'
            ? START_HELD_WORDS.removeAsk(heldAsk.name)
            : START_HELD_WORDS.startOverAsk
        }
        actions={<ValuesEyeButton />}
        footer={
          <div className='p-4'>
            <ModalFooterActions
              note={
                heldChoice === null
                  ? heldAsk?.kind === 'startOver'
                    ? START_HELD_WORDS.startOverBlocker
                    : START_HELD_WORDS.blocker
                  : null
              }
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  disabled={isHeldSaving}
                  onClick={() => setHeldAsk(null)}
                >
                  Cancel
                </Button>
              }
              rightActions={
                <Button
                  type='button'
                  variant='destructive'
                  disabled={heldChoice === null || isHeldSaving}
                  onClick={() => void runHeld()}
                >
                  {heldAsk?.kind === 'startOver'
                    ? START_WORDS.startOverConfirm
                    : START_WORDS.rowActionsRemove}
                </Button>
              }
            />
          </div>
        }
      >
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            <MaskedText>
              {heldAsk?.kind === 'remove'
                ? START_HELD_WORDS.removeCaption(
                    formatCents(
                      getHeldCents?.(heldAsk.entry.kind, heldAsk.entry.id) ?? 0,
                    ),
                  )
                : START_HELD_WORDS.startOverCaption(
                    formatCents(heldTotal),
                    holdings.length,
                  )}
            </MaskedText>
          </p>
          <HeldChoiceList
            value={heldChoice}
            onChange={setHeldChoice}
            freeBody={START_HELD_WORDS.freeBody}
            keepBody={START_HELD_WORDS.keepBody}
          />
          {error && (
            <p className='text-destructive pt-1 text-sm' role='alert'>
              {error}
            </p>
          )}
        </div>
      </DetailSheet>
      <DetailSheet
        isOpen={isEnvelopeHelpOpen}
        onClose={() => setIsEnvelopeHelpOpen(false)}
        title={START_WORDS.envelopeDoor}
        footer={
          <div className='p-4'>
            <Button
              className='w-full'
              onClick={() => setIsEnvelopeHelpOpen(false)}
            >
              Got it
            </Button>
          </div>
        }
      >
        <p className='text-sm text-pretty'>{START_WORDS.envelopeDoorBody}</p>
      </DetailSheet>
    </Subview>
  );
}

export default StartFlow;
