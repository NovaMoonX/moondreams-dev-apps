import { useState, type ReactNode } from 'react';
import {
  CircleHelp,
  Mail,
  Pencil,
  ReceiptText,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import EmptyCard from '@/components/EmptyCard';
import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import { START_WORDS } from '@apps/runway/constants';
import StartRowList from '@apps/runway/screens/start/StartRowList';
import {
  describeCounts,
  type StartRow,
} from '@apps/runway/screens/start/startRows';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { StartStep } from '@apps/runway/utils/startDraft';

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
    help: string;
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
    help: START_WORDS.envelopesHelp,
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
  doneContent: ReactNode;
  /** Replaces the final Done button, for the step that asks for a sign-in. */
  doneAction?: ReactNode;
  remove: (kind: StartKind, id: string) => Promise<void>;
  startOver: () => Promise<void>;
  startOverMessage: (parts: string) => string;
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
}: StartFlowProps) {
  const { closeView } = useRunwayUrlState();
  const { confirm } = useActionModal();
  const counts = {
    income: rows.income.length,
    bill: rows.bill.length,
    envelope: rows.envelope.length,
    goal: rows.goal.length,
  };
  const total = counts.income + counts.bill + counts.envelope + counts.goal;
  const [isAsking, setIsAsking] = useState(total > 0);
  const [step, setStep] = useState<StartStep>(
    steps.includes(resumeStep) ? resumeStep : steps[0],
  );
  const [form, setForm] = useState<StartFormState | null>(null);
  const [selected, setSelected] = useState<{
    kind: StartKind;
    id: string;
  } | null>(null);
  const [isEnvelopeHelpOpen, setIsEnvelopeHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const index = steps.indexOf(step);

  const openForm = (name: StartFormName, entryId: string | null = null) =>
    setForm((current) => ({ name, entryId, key: (current?.key ?? 0) + 1 }));
  const closeForm = () => setForm(null);
  const goTo = (next: StartStep) => {
    setStep(next);
    onStepChange?.(next);
  };
  const goBack = () => (index === 0 ? closeView() : goTo(steps[index - 1]));
  const goNext = () => goTo(steps[index + 1]);

  const selectedRow =
    selected === null
      ? null
      : (rows[selected.kind].find((row) => row.id === selected.id) ?? null);

  const handleRemove = async () => {
    if (!selected || !selectedRow) return;
    const isConfirmed = await confirm({
      title: START_WORDS.removeTitle(selectedRow.name),
      message: START_WORDS.removeMessage,
      confirmText: START_WORDS.rowActionsRemove,
      destructive: true,
    });
    if (!isConfirmed) return;
    setError(null);
    try {
      await remove(selected.kind, selected.id);
      setSelected(null);
    } catch {
      setError(START_WORDS.removeFailed);
    }
  };

  const handleStartOver = async () => {
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
      await startOver();
      setIsAsking(false);
      setStep(steps[0]);
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
      content: doneContent,
      isDone: true,
      isRequired: false,
    };
  };

  const body = getBody();
  const isLast = step === 'done';

  if (isAsking) {
    return (
      <Subview
        overlay
        title={START_WORDS.title}
        onClose={closeView}
        onBack={closeView}
      >
        <div className='flex flex-1 flex-col gap-4'>
          <div className='space-y-1'>
            <h2 className='text-xl font-semibold text-balance'>
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
      </Subview>
    );
  }

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
            {START_WORDS.stepOf(index + 1, steps.length)}
          </p>
          <h2 className='text-xl font-semibold text-balance'>{body.ask}</h2>
          <p className='text-muted-foreground text-sm text-pretty'>
            {body.help}
          </p>
        </div>
        {index === 0 && notice}
        <div className='space-y-3'>{body.content}</div>
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <ModalFooterActions
          note={body.isRequired && !body.isDone ? START_WORDS.needIncome : null}
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
                <Button type='button' onClick={closeView}>
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
