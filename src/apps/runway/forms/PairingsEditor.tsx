import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { getErrorMessage } from '@/utils/errorUtils';
import { parseMoneyToCents, parsePercentToBps } from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  ITEM_SHEET_WORDS,
  MAX_PAIRINGS,
} from '@apps/runway/constants';
import InlineNotice from '@/components/InlineNotice';
import PairingRowSheet, {
  type PairingRow,
} from '@apps/runway/forms/PairingRowSheet';
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

interface PairingsFormData {
  rows: PairingRow[];
}

interface PairingsEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where cancelling goes, when that is not where saving goes (back to the sheet it opened from). */
  onCancel?: () => void;
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
    return canBeEmpty ? null : 'Add something to pay first from this money.';
  if (rows.some((row) => row.targetItemId === null))
    return 'Pick what each one pays first.';
  const ids = rows.map((row) => row.targetItemId);
  if (new Set(ids).size !== ids.length)
    return 'Each bill, envelope or goal can be listed once.';
  if (rows.some((row) => toAmount(row) === null))
    return 'Enter an amount for each one.';
  if (rows.filter((row) => row.mode === 'rest').length > 1)
    return 'Only one can take the rest.';
  return null;
};

/** Hands the form field's own change callback to the sheet, so a row edited in place of the list still writes into the field. */
function ValueChangeHandle({
  onChange,
  targetRef,
}: {
  onChange: (rows: PairingRow[]) => void;
  targetRef: { current: ((rows: PairingRow[]) => void) | null };
}) {
  useEffect(() => {
    targetRef.current = onChange;
  });
  return null;
}

/** Says which bills, envelopes and goals a source, pay line or day sends its money to, and whether a short one is topped up from the rest of the pool. */
function PairingsEditor({
  isOpen,
  onClose,
  onCancel,
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
  const changeRows = useRef<((rows: PairingRow[]) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<number | null>(
    initialData.rows.length === 1 && initial.length === 0 && !change ? 0 : null,
  );
  const [newKeys, setNewKeys] = useState<number[]>(
    initial.length === 0 && !change ? [0] : [],
  );

  const targets = [...envelopes, ...bills, ...goals].map(
    ({ item, version }) => ({
      value: item.id,
      label: version.payload.name,
      emoji: version.payload.emoji,
      kind: version.kind,
    }),
  );
  const nameOf = (id: string) =>
    targets.find((target) => target.value === id)?.label ?? 'Something removed';
  const lockedIds = new Set(locked.map((pairing) => pairing.targetItemId));
  const choices = targets
    .filter((target) => !lockedIds.has(target.value))
    .map(({ value, label, emoji, kind }) => ({
      value,
      text: label,
      emoji,
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
    setNewKeys((keys) => [...keys, nextKey]);
    setEditingKey(nextKey);
    onChange([...rows, blankRow(nextKey)]);
  };
  const getRowAmountText = (row: PairingRow) => {
    const amount = toAmount(row);
    return amount === null
      ? row.mode === 'percent'
        ? 'Percent not set'
        : 'Amount not set'
      : amount.kind === 'exact'
        ? `${describeAmount(amount)} each pay`
        : describeAmount(amount, fromLabel);
  };

  const editingRow =
    formData.rows.find((row) => row.key === editingKey) ?? null;
  const patchRows = (rows: PairingRow[]) => {
    changeRows.current?.(rows);
    setFormData({ rows });
  };
  const fields = [
    custom({
      name: 'rows',
      label: '',
      renderComponent: (props) => {
        const rows = props.value as PairingRow[];
        return (
          <>
            <ValueChangeHandle
              onChange={props.onValueChange}
              targetRef={changeRows}
            />
            <div className='space-y-3'>
              <InlineNotice tone='info'>
                {ITEM_SHEET_WORDS.fundsNotice}
              </InlineNotice>
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
              {rows.length > 0 && (
                <ul className='border-border divide-border divide-y rounded-2xl border'>
                  {rows.map((row) => (
                    <li key={row.key}>
                      <Button
                        type='button'
                        variant='tertiary'
                        className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
                        onClick={() => setEditingKey(row.key)}
                      >
                        <ItemBadge
                          name={
                            row.targetItemId === null
                              ? '?'
                              : nameOf(row.targetItemId)
                          }
                          emoji={
                            targets.find(
                              (target) => target.value === row.targetItemId,
                            )?.emoji ?? null
                          }
                        />
                        <span className='min-w-0 flex-1 text-left break-words'>
                          <span className='block'>
                            {row.targetItemId === null
                              ? 'Pick what comes out first'
                              : nameOf(row.targetItemId)}
                          </span>
                          <span className='text-muted-foreground block text-sm'>
                            {getRowAmountText(row)}
                          </span>
                        </span>
                        <ChevronRight
                          className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                          aria-hidden='true'
                        />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {rows.length + locked.length < MAX_PAIRINGS &&
                choices.length > rows.length && (
                  <div>
                    <RevealChip
                      onClick={() => addRow(rows, props.onValueChange)}
                    >
                      Add something to pay first
                    </RevealChip>
                  </div>
                )}
              {note && <p className='text-muted-foreground text-xs'>{note}</p>}
            </div>
          </>
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
    <FormSheet isOpen={isOpen} onClose={onCancel ?? onClose} title={title}>
      {editingRow && (
        <PairingRowSheet
          key={editingRow.key}
          row={editingRow}
          isNew={newKeys.includes(editingRow.key)}
          choices={choices.filter(
            (choice) =>
              choice.value === editingRow.targetItemId ||
              !formData.rows.some((row) => row.targetItemId === choice.value),
          )}
          fromLabel={fromLabel}
          amountText={getRowAmountText(editingRow)}
          problem={getBlocker([editingRow], true)}
          onChange={(patch) =>
            patchRows(
              formData.rows.map((row) =>
                row.key === editingRow.key ? { ...row, ...patch } : row,
              ),
            )
          }
          onRemove={() => {
            patchRows(
              formData.rows.filter((entry) => entry.key !== editingRow.key),
            );
            setEditingKey(null);
          }}
          onClose={() => {
            if (editingRow.targetItemId === null)
              patchRows(
                formData.rows.filter((entry) => entry.key !== editingRow.key),
              );
            setNewKeys((keys) => keys.filter((key) => key !== editingRow.key));
            setEditingKey(null);
          }}
        />
      )}
      <div hidden={editingRow !== null}>
        <ChangeSteps
          isReason={flow.step === 'reason'}
          reason={<ChangeReason flow={flow} onClose={onCancel ?? onClose} />}
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
                      onClick={onCancel ?? onClose}
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
      </div>
    </FormSheet>
  );
}

export default PairingsEditor;
