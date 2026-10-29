import { useRef, useState } from 'react';
import { Loader, Pencil, Trash2, Upload, X } from 'lucide-react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import { formatFileSize } from '@/utils/fileUtils';
import {
  BUDGET_ACCEPT,
  BUDGET_LIMITS,
  BUDGET_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import { toDraftSourceId } from '@apps/runway/forms/fundingFlow';
import {
  getMissingStep,
  isAmountStep,
  toBillValue,
  toEnvelopeValue,
  toGoalValue,
  toIncomeValue,
  type BudgetKind,
  type BudgetValues,
} from '@apps/runway/lib/budgetDraft';
import {
  EMPTY_BUDGET_READING,
  type BudgetReading,
} from '@apps/runway/lib/normalizeBudgetReading';
import { isBudgetFile, readBudget } from '@apps/runway/lib/readBudget';
import { MaskedText } from '@apps/runway/components/MaskedText';
import StartRowList from '@apps/runway/screens/start/StartRowList';
import {
  toBillRow,
  toEnvelopeRow,
  toGoalRow,
  toIncomeRow,
  type StartRow,
} from '@apps/runway/screens/start/startRows';
import { DraftPlanNotReady } from '@apps/runway/store/actions/draftActions';
import type { DraftKind, StartDraft } from '@apps/runway/utils/startDraft';

const KINDS: { kind: BudgetKind; label: string; search: string }[] = [
  { kind: 'income', label: BUDGET_WORDS.income, search: 'Search your income' },
  { kind: 'bill', label: BUDGET_WORDS.bills, search: 'Search your bills' },
  {
    kind: 'envelope',
    label: BUDGET_WORDS.envelopes,
    search: 'Search your envelopes',
  },
  { kind: 'goal', label: BUDGET_WORDS.goals, search: 'Search your goals' },
];

interface Proposal {
  key: string;
  kind: BudgetKind;
  name: string;
  sourceFile: string;
  notes: string[];
  value: BudgetValues[BudgetKind];
}

interface ReadItem {
  name: string;
  sourceFile: string;
  notes: string[];
}

const KEY_SEPARATOR = ':';

const toProposals = <K extends BudgetKind>(
  kind: K,
  items: ReadItem[],
  make: (item: never) => BudgetValues[K],
  edited: Record<string, BudgetValues[BudgetKind]>,
  removed: ReadonlySet<string>,
): Proposal[] =>
  items.flatMap((item, index) => {
    const key = `${kind}${KEY_SEPARATOR}${index}`;
    return removed.has(key)
      ? []
      : [
          {
            key,
            kind,
            name: item.name,
            sourceFile: item.sourceFile,
            notes: item.notes,
            value: edited[key] ?? make(item as never),
          },
        ];
  });

const toRow = (proposal: Proposal): StartRow => {
  const { key, kind, value } = proposal;
  const step = getMissingStep(kind, value);
  if (step !== null) {
    return {
      id: key,
      name: proposal.name,
      emoji: null,
      line: isAmountStep(step)
        ? proposal.sourceFile
        : BUDGET_WORDS.openToFinish,
      amount: isAmountStep(step) ? BUDGET_WORDS.amountNotFound : null,
    };
  }
  if (kind === 'income') {
    const income = value as BudgetValues['income'];
    return toIncomeRow(key, income.sourceName, income.amount, income.schedule);
  }
  if (kind === 'bill') return toBillRow(key, value as BudgetValues['bill']);
  if (kind === 'envelope')
    return toEnvelopeRow(key, value as BudgetValues['envelope']);
  return toGoalRow(key, value as BudgetValues['goal']);
};

const countReading = (reading: BudgetReading) =>
  reading.incomes.length +
  reading.bills.length +
  reading.envelopes.length +
  reading.goals.length;

interface BudgetStartProps {
  /** Where the proposals go: a signed-in plan, or this device for someone with no account yet. */
  mode: 'plan' | 'device';
  /** Adds what was reviewed; a rejection is shown here and the review stays open. */
  onAdd: (draft: Pick<StartDraft, DraftKind>) => Promise<void>;
  /** Leaves for the choice of how to start. */
  onBack: () => void;
}

/** "Start from your budget": pick files or paste text, have an AI read them in one go, then review what it found in the same forms Starting out uses. Nothing is saved until the person adds it. */
function BudgetStart({ mode, onAdd, onBack }: BudgetStartProps) {
  const { confirm } = useActionModal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState<BudgetReading | null>(null);
  const [readFiles, setReadFiles] = useState(0);
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const [isReading, setIsReading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<
    Record<string, BudgetValues[BudgetKind]>
  >({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ key: string; token: number } | null>(null);
  const today = todayAsUtcDate();

  const slotsLeft = BUDGET_LIMITS.files - readFiles - files.length;
  const hasInput = files.length > 0 || pasted.trim() !== '';
  const data = reading ?? EMPTY_BUDGET_READING;

  const proposals: Proposal[] = [
    ...toProposals(
      'income',
      data.incomes,
      (item) => toIncomeValue(item, today),
      edited,
      removed,
    ),
    ...toProposals(
      'bill',
      data.bills,
      (item) => toBillValue(item, today),
      edited,
      removed,
    ),
    ...toProposals(
      'envelope',
      data.envelopes,
      (item) => toEnvelopeValue(item, today),
      edited,
      removed,
    ),
    ...toProposals(
      'goal',
      data.goals,
      (item) => toGoalValue(item, today),
      edited,
      removed,
    ),
  ];
  const ofKind = (kind: BudgetKind) =>
    proposals.filter((proposal) => proposal.kind === kind);
  const needing = proposals.filter(
    (proposal) => getMissingStep(proposal.kind, proposal.value) !== null,
  ).length;
  const selectedProposal =
    proposals.find((proposal) => proposal.key === selected) ?? null;
  const formProposal =
    form === null
      ? null
      : (proposals.find((proposal) => proposal.key === form.key) ?? null);

  const pick = (list: File[]) => {
    const wrong = list.find((file) => !isBudgetFile(file));
    if (wrong) return setError(BUDGET_WORDS.wrongType(wrong.name));
    const fresh = list.filter(
      (file) =>
        !files.some(
          (have) => have.name === file.name && have.size === file.size,
        ),
    );
    const next = [...files, ...fresh];
    if (readFiles + next.length > BUDGET_LIMITS.files)
      return setError(BUDGET_WORDS.tooMany);
    if (next.reduce((sum, file) => sum + file.size, 0) > BUDGET_LIMITS.bytes)
      return setError(BUDGET_WORDS.tooBig);
    setError(null);
    setFiles(next);
  };

  const read = async () => {
    setIsReading(true);
    setError(null);
    try {
      const next = await readBudget(files, pasted, reading ?? undefined);
      if (reading === null && countReading(next) === 0) {
        setError(BUDGET_WORDS.nothingFound);
        return;
      }
      setReading(next);
      setReadFiles((count) => count + files.length);
      setFiles([]);
      setPasted('');
      setPhase('review');
    } catch (readError) {
      console.error('Reading the budget failed', readError);
      setError(
        getAiReadFailureMessage(readError, {
          subject: BUDGET_WORDS.failSubject,
          fallback: BUDGET_WORDS.failFallback,
        }),
      );
    } finally {
      setIsReading(false);
    }
  };

  const leave = async () => {
    if (reading === null) return onBack();
    const isConfirmed = await confirm({
      title: BUDGET_WORDS.leaveTitle,
      message: BUDGET_WORDS.leaveMessage,
      confirmText: BUDGET_WORDS.leaveConfirm,
      destructive: true,
    });
    if (isConfirmed) onBack();
  };

  const add = async () => {
    setIsAdding(true);
    setError(null);
    const valuesOf = <K extends BudgetKind>(kind: K) =>
      ofKind(kind).map(({ key, value }) => ({
        id: key,
        value: value as BudgetValues[K],
      }));
    try {
      await onAdd({
        incomes: valuesOf('income'),
        bills: valuesOf('bill'),
        envelopes: valuesOf('envelope'),
        goals: valuesOf('goal'),
      });
    } catch (addError) {
      console.error('Adding the budget failed', addError);
      setError(
        addError instanceof DraftPlanNotReady
          ? BUDGET_WORDS.notReady
          : BUDGET_WORDS.planFailed,
      );
      setIsAdding(false);
    }
  };

  const renderForm = () => {
    if (form === null || formProposal === null) return null;
    const { kind, value, key } = formProposal;
    const sink = {
      initial: value,
      openStep: getMissingStep(kind, value),
      sources: ofKind('income').map((entry) => {
        const name = (entry.value as BudgetValues['income']).sourceName;
        return { id: toDraftSourceId(name), name };
      }),
      onSave: (next: BudgetValues[BudgetKind]) =>
        setEdited((current) => ({ ...current, [key]: next })),
    };
    const close = () => setForm(null);
    const formKey = form.token;
    if (kind === 'income')
      return (
        <IncomeForm
          key={formKey}
          isOpen
          title='Income source'
          defaultFrequency={null}
          draft={sink as never}
          onClose={close}
        />
      );
    if (kind === 'bill')
      return (
        <BillForm
          key={formKey}
          isOpen
          title='Bill'
          draft={sink as never}
          onClose={close}
        />
      );
    if (kind === 'envelope')
      return (
        <EnvelopeForm
          key={formKey}
          isOpen
          title='Envelope'
          draft={sink as never}
          onClose={close}
        />
      );
    return (
      <GoalForm
        key={formKey}
        isOpen
        title='Goal'
        draft={sink as never}
        onClose={close}
      />
    );
  };

  const notRead = data.notRead;

  if (phase === 'input') {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <div className='space-y-1'>
          <h2 className='text-2xl font-semibold text-balance'>
            {BUDGET_WORDS.ask}
          </h2>
          <p className='text-muted-foreground text-sm text-pretty'>
            {reading === null
              ? BUDGET_WORDS.help
              : BUDGET_WORDS.addAnotherBody(slotsLeft)}
          </p>
        </div>
        <div className='space-y-3'>
          {files.length > 0 && (
            <ul className='border-border bg-card divide-border divide-y rounded-2xl border'>
              {files.map((file) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className='flex items-center gap-3 px-3 py-2'
                >
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{file.name}</p>
                    <p className='text-muted-foreground text-xs'>
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label={BUDGET_WORDS.removeFile(file.name)}
                    disabled={isReading}
                    className="relative before:absolute before:-inset-1.5 before:content-['']"
                    onClick={() =>
                      setFiles((current) => current.filter((f) => f !== file))
                    }
                  >
                    <X className='h-4 w-4' aria-hidden='true' />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {slotsLeft > 0 && (
            <Button
              type='button'
              variant='secondary'
              className='w-full gap-2'
              disabled={isReading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className='h-4 w-4' aria-hidden='true' />
              {files.length > 0
                ? BUDGET_WORDS.chooseMore
                : BUDGET_WORDS.chooseFiles}
            </Button>
          )}
          <p className='text-muted-foreground text-xs text-pretty'>
            {BUDGET_WORDS.accepts} · up to {BUDGET_LIMITS.bytes / 1024 / 1024}{' '}
            MB together. {BUDGET_WORDS.tabsHint}
          </p>
          <Input
            ref={fileRef}
            type='file'
            multiple
            accept={BUDGET_ACCEPT}
            aria-label={BUDGET_WORDS.chooseFiles}
            className='hidden'
            onChange={(event) => {
              pick(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <Textarea
            rows={5}
            variant='base'
            aria-label={BUDGET_WORDS.pasteLabel}
            placeholder={BUDGET_WORDS.pastePlaceholder}
            maxLength={BUDGET_LIMITS.textChars}
            disabled={isReading}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
        </div>
        {isReading && (
          <p
            className='text-muted-foreground flex items-center gap-2 text-sm'
            role='status'
          >
            <Loader className='h-4 w-4 animate-spin' aria-hidden='true' />
            {BUDGET_WORDS.reading(files.length, pasted.trim() !== '')}
          </p>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <ModalFooterActions
          note={hasInput || isReading ? null : BUDGET_WORDS.needInput}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              disabled={isReading}
              onClick={() => (reading === null ? onBack() : setPhase('review'))}
            >
              Back
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isReading}
              disabled={isReading || !hasInput}
              onClick={() => void read()}
            >
              {BUDGET_WORDS.read}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='space-y-1'>
        <h2 className='text-2xl font-semibold text-balance'>
          {BUDGET_WORDS.reviewAsk}
        </h2>
        <p className='text-muted-foreground text-sm text-pretty'>
          {BUDGET_WORDS.reviewHelp}
        </p>
      </div>
      {proposals.length === 0 && (
        <p className='text-muted-foreground text-sm'>{BUDGET_WORDS.empty}</p>
      )}
      {KINDS.map(({ kind, label, search }) => {
        const list = ofKind(kind);
        return list.length === 0 ? null : (
          <div key={kind} className='space-y-2'>
            <SectionDivider label={label} />
            <StartRowList
              rows={list.map(toRow)}
              searchLabel={search}
              onOpen={setSelected}
            />
          </div>
        );
      })}
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        {readFiles < BUDGET_LIMITS.files && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            onClick={() => setPhase('input')}
          >
            {BUDGET_WORDS.addAnother}
          </Button>
        )}
        {notRead.length > 0 && (
          <span className='text-muted-foreground inline-flex items-center gap-1 text-sm'>
            {BUDGET_WORDS.notReadLabel}
            <HelpTip title={BUDGET_WORDS.notReadTitle}>
              <ul className='space-y-2'>
                {[...new Set(notRead.map((entry) => entry.file))].map(
                  (file) => (
                    <li key={file}>
                      <p className='font-medium'>{file}</p>
                      <ul className='list-disc pl-5'>
                        {notRead
                          .filter((entry) => entry.file === file)
                          .map((entry) => (
                            <li key={entry.text}>{entry.text}</li>
                          ))}
                      </ul>
                    </li>
                  ),
                )}
              </ul>
            </HelpTip>
          </span>
        )}
      </div>
      {mode === 'device' && (
        <p className='text-muted-foreground text-sm text-pretty'>
          {BUDGET_WORDS.deviceNote}
        </p>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      <ModalFooterActions
        note={needing > 0 ? BUDGET_WORDS.needDetails(needing) : null}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            disabled={isAdding}
            onClick={() => void leave()}
          >
            Back
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isAdding}
            disabled={isAdding || proposals.length === 0 || needing > 0}
            onClick={() => void add()}
          >
            {mode === 'plan' ? BUDGET_WORDS.planAdd : BUDGET_WORDS.deviceAdd}
          </Button>
        }
      />
      <DetailSheet
        isOpen={selectedProposal !== null}
        onClose={() => setSelected(null)}
        title={selectedProposal?.name ?? ''}
        actions={<ValuesEyeButton />}
      >
        <div className='space-y-3'>
          {selectedProposal && (
            <div className='space-y-1 text-sm'>
              <p className='text-muted-foreground'>
                {BUDGET_WORDS.sourcePrefix} {selectedProposal.sourceFile}
              </p>
              {selectedProposal.notes.map((note) => (
                <p key={note} className='text-pretty'>
                  <MaskedText>{note}</MaskedText>
                </p>
              ))}
            </div>
          )}
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              icon={<Pencil className='h-5 w-5' />}
              label={BUDGET_WORDS.openToChange}
              hasChevron
              onClick={() => {
                if (!selected) return;
                setForm((current) => ({
                  key: selected,
                  token: (current?.token ?? 0) + 1,
                }));
                setSelected(null);
              }}
            />
            <ActionRow
              isGrouped
              isRoomy
              isDestructive
              icon={<Trash2 className='h-5 w-5' />}
              label={BUDGET_WORDS.removeOne}
              onClick={() => {
                if (selected)
                  setRemoved((current) => new Set([...current, selected]));
                setSelected(null);
              }}
            />
          </ActionGroup>
        </div>
      </DetailSheet>
      {renderForm()}
    </div>
  );
}

export default BudgetStart;
