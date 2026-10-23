import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
  Select,
} from '@moondreamsdev/dreamer-ui/components';

import AmountField, { type AmountMode } from '@/components/AmountField';
import AppToggle from '@/components/AppToggle';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { parseMoneyToCents, parsePercentToBps } from '@/utils/moneyUtils';
import { CHANGE_WORDS, MAX_PAIRINGS } from '@apps/runway/constants';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import { changeField } from '@apps/runway/forms/changeField';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  FundingAmount,
  Pairing,
  PayLineSealed,
  SourceSealed,
} from '@apps/runway/types';
import { describeAmount } from '@apps/runway/utils/fundingText';

type Of = 'dayMoney' | 'remaining';

interface PairingRow {
  key: number;
  targetItemId: string | null;
  mode: AmountMode;
  of: Of;
  amount: string;
  topUp: boolean;
}

interface PairingsFormData {
  rows: PairingRow[];
}

interface PairingsEditorProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Who the money comes from, in the person's words: "Main job", "this pay". */
  fromLabel: string;
  /** Pairings that are shown but not changed here. */
  locked: readonly Pairing[];
  /** The pairings to change; they start as rows. */
  initial: readonly Pairing[];
  /** Saves a day's own set. */
  onSave?: (pairings: Pairing[]) => Promise<void>;
  /** A source or pay line whose set this changes: a version from a date, with the effect shown first. */
  change?: {
    itemId: string;
    kind: 'source' | 'payLine';
    current: SourceSealed | PayLineSealed;
  };
  /** Shown when a set of pairings can be cleared back to the plan. */
  note?: string;
}

const { custom } = FormFactories;

const EMPTY_SOURCE: SourceSealed = { name: '', pairings: [] };

const blankRow = (key: number): PairingRow => ({
  key,
  targetItemId: null,
  mode: 'exact',
  of: 'dayMoney',
  amount: '',
  topUp: false,
});

const MODES = [
  { value: 'exact', label: 'Exact amount' },
  { value: 'percent', label: '% of the money' },
  { value: 'rest', label: 'The rest' },
] as const;

const OF_OPTIONS = [
  { value: 'dayMoney', label: "Of the day's money" },
  { value: 'remaining', label: 'Of what is left' },
] as const;

const toAmount = (row: PairingRow): FundingAmount | null => {
  if (row.mode === 'rest') return { kind: 'rest' };
  if (row.mode === 'percent') {
    const bps = parsePercentToBps(row.amount);
    return bps === null ? null : { kind: 'percent', bps, of: row.of };
  }
  const cents = parseMoneyToCents(row.amount);
  return cents === null || cents <= 0 ? null : { kind: 'exact', cents };
};

const toRow = (pairing: Pairing, key: number): PairingRow => {
  const { amount } = pairing;
  return {
    key,
    targetItemId: pairing.targetItemId,
    mode: amount.kind,
    of: amount.kind === 'percent' ? amount.of : 'dayMoney',
    amount:
      amount.kind === 'exact'
        ? (amount.cents / 100).toFixed(2)
        : amount.kind === 'percent'
          ? String(amount.bps / 100)
          : '',
    topUp: pairing.topUpFromAnySource,
  };
};

const getBlocker = (rows: PairingRow[], canBeEmpty: boolean) => {
  if (rows.length === 0)
    return canBeEmpty ? null : 'Add something this money should fund.';
  if (rows.some((row) => row.targetItemId === null))
    return 'Pick what each one funds.';
  const ids = rows.map((row) => row.targetItemId);
  if (new Set(ids).size !== ids.length)
    return 'Each bill, envelope or goal can be funded once.';
  if (rows.some((row) => toAmount(row) === null))
    return 'Enter an amount for each one.';
  if (rows.filter((row) => row.mode === 'rest').length > 1)
    return 'Only one can take the rest.';
  return null;
};

/** Says which bills, envelopes and goals a source, pay line or day sends its money to, and whether a short one is topped up from the rest of the pool. */
function PairingsEditor({
  isOpen,
  onClose,
  title,
  fromLabel,
  locked,
  initial,
  onSave,
  change,
  note,
}: PairingsEditorProps) {
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [initialData] = useState<PairingsFormData>(() => ({
    rows: initial.length > 0 || change ? initial.map(toRow) : [blankRow(0)],
  }));
  const [formData, setFormData] = useState<PairingsFormData>(initialData);
  const [nextKey, setNextKey] = useState(initialData.rows.length);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const targets = [...envelopes, ...bills, ...goals].map(
    ({ item, version }) => ({
      value: item.id,
      label: `${version.payload.emoji ? `${version.payload.emoji} ` : ''}${version.payload.name}`,
      kind: version.kind,
    }),
  );
  const nameOf = (id: string) =>
    targets.find((target) => target.value === id)?.label ?? 'Something removed';
  const lockedIds = new Set(locked.map((pairing) => pairing.targetItemId));
  const choices = targets
    .filter((target) => !lockedIds.has(target.value))
    .map(({ value, label, kind }) => ({
      value,
      text: label,
      description:
        kind === 'bill' ? 'Bill' : kind === 'goal' ? 'Goal' : 'Envelope',
    }));
  const blocker = getBlocker(formData.rows, change !== undefined);

  const buildPairings = (rows: PairingRow[]) =>
    rows.flatMap((row): Pairing[] => {
      const amount = toAmount(row);
      return row.targetItemId === null || amount === null
        ? []
        : [
            {
              targetItemId: row.targetItemId,
              amount,
              topUpFromAnySource: row.topUp,
            },
          ];
    });

  const candidate =
    change && blocker === null
      ? {
          ...change.current,
          pairings: [...locked, ...buildPairings(formData.rows)],
        }
      : null;
  const flow = useChangeFlow({
    itemId: change?.itemId ?? '',
    kind: change?.kind ?? 'payLine',
    current: change?.current ?? EMPTY_SOURCE,
    candidate,
    onDone: onClose,
  });
  const editBlocker = flow.getBlocker(blocker);

  const handleSave = async () => {
    const pairings = buildPairings(formData.rows);
    setError(null);
    setIsSaving(true);
    try {
      await onSave?.(pairings);
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const addRow = (
    rows: PairingRow[],
    onChange: (rows: PairingRow[]) => void,
  ) => {
    setNextKey(nextKey + 1);
    onChange([...rows, blankRow(nextKey)]);
  };

  const fields = [
    custom({
      name: 'rows',
      label: '',
      renderComponent: (props) => {
        const rows = props.value as PairingRow[];
        const update = (key: number, patch: Partial<PairingRow>) =>
          props.onValueChange(
            rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
          );
        return (
          <div className='space-y-3'>
            {locked.length > 0 && (
              <ul className='border-border divide-border divide-y rounded-2xl border'>
                {locked.map((pairing) => (
                  <li
                    key={pairing.targetItemId}
                    className='flex items-start justify-between gap-3 p-3 text-sm'
                  >
                    <span className='min-w-0 break-words'>
                      {nameOf(pairing.targetItemId)}
                    </span>
                    <span className='text-muted-foreground shrink-0 text-right'>
                      {describeAmount(pairing.amount, fromLabel)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {rows.map((row) => (
              <div
                key={row.key}
                className='border-border space-y-3 rounded-2xl border p-3'
              >
                <div className='flex items-start gap-2'>
                  <div className='min-w-0 flex-1 space-y-1.5'>
                    <p className='text-muted-foreground text-xs'>Funds</p>
                    <Select
                      searchable={choices.length > 8}
                      placeholder='A bill, envelope or goal'
                      options={choices}
                      value={row.targetItemId ?? ''}
                      onChange={(value) =>
                        update(row.key, { targetItemId: value })
                      }
                    />
                  </div>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    className='mt-6 size-10 shrink-0 p-0'
                    aria-label='Remove this one'
                    onClick={() =>
                      props.onValueChange(
                        rows.filter((entry) => entry.key !== row.key),
                      )
                    }
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>
                <AmountField
                  label='How much'
                  value={row.amount}
                  onChange={(amount) => update(row.key, { amount })}
                  mode={row.mode}
                  modes={MODES}
                  onModeChange={(mode) => update(row.key, { mode })}
                  percentOfLabel={`of ${fromLabel}`}
                  restHint={`Takes what is left of ${fromLabel} after the others.`}
                />
                {row.mode === 'percent' && (
                  <PillGroup
                    label='A percentage of'
                    isThin
                    options={OF_OPTIONS}
                    value={row.of}
                    onChange={(of) => update(row.key, { of })}
                  />
                )}
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='text-sm'>Top up from the rest if short</p>
                    <p className='text-muted-foreground text-xs'>
                      Off: a Must or Should is held until you choose.
                    </p>
                  </div>
                  <AppToggle
                    aria-label='Top up from the rest if short'
                    checked={row.topUp}
                    onCheckedChange={(topUp) => update(row.key, { topUp })}
                  />
                </div>
              </div>
            ))}
            {rows.length + locked.length < MAX_PAIRINGS &&
              choices.length > rows.length && (
                <div>
                  <RevealChip
                    icon={<Plus className='h-4 w-4' />}
                    onClick={() => addRow(rows, props.onValueChange)}
                  >
                    Add something to fund
                  </RevealChip>
                </div>
              )}
            {note && <p className='text-muted-foreground text-xs'>{note}</p>}
          </div>
        );
      },
    }),
  ];

  const flowValue = {
    flow,
    itemId: change?.itemId ?? '',
    kind: change?.kind ?? 'payLine',
    candidate,
  };
  const formFields = change ? [...fields, changeField] : fields;

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ChangeSteps
        isReason={flow.step === 'reason'}
        reason={<ChangeReason flow={flow} onClose={onClose} />}
      >
        <ChangeFlowContext value={flowValue}>
          <Form
            id='runway-pairings'
            form={formFields}
            initialData={initialData}
            columns={1}
            onDataChange={(data) => setFormData(data as PairingsFormData)}
            onSubmit={() => {
              if (change) {
                flow.setStep('reason');
                return;
              }
              void handleSave();
            }}
            submitButton={
              <ModalFooterActions
                note={error ?? (change ? editBlocker : blocker)}
                cancelAction={
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={onClose}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                }
                rightActions={
                  <Button
                    type='submit'
                    loading={isSaving}
                    disabled={
                      isSaving || (change ? editBlocker : blocker) !== null
                    }
                  >
                    {change ? CHANGE_WORDS.review : 'Save'}
                  </Button>
                }
              />
            }
          />
        </ChangeFlowContext>
      </ChangeSteps>
    </FormSheet>
  );
}

export default PairingsEditor;
