import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';

import AmountField, { type AmountMode } from '@/components/AmountField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { parseMoneyToCents, parsePercentToBps } from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  ENVELOPE_ORDER_STEP,
  FUNDING_CADENCE_LABELS,
  FUNDING_CADENCES,
  MAX_CHOSEN_DAYS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createEnvelope } from '@apps/runway/store/actions/itemActions';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import { changeField } from '@apps/runway/forms/changeField';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { toFundingInput } from '@apps/runway/utils/fundingInput';
import {
  selectComingDays,
  selectEnvelopes,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  FundingAmount,
  FundingRule,
  EnvelopeSealed,
  Priority,
} from '@apps/runway/types';

type Cadence = (typeof FUNDING_CADENCES)[number];

interface EnvelopeFormData {
  name: string;
  priority: Priority | null;
  amount: string;
  cadence: Cadence;
  dayKeys: string[];
  /** Null until the person adds one. */
  emoji: string | null;
}

interface EnvelopeFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** The envelope to change; its saved values start the form and a save adds a version from a date. */
  editing?: { itemId: string; payload: EnvelopeSealed };
  /** The income day whose screen opened the edit; "this income day" then means it. */
  presetDayKey?: string;
}

const { custom } = FormFactories;

const AMOUNT_MODES = [
  { value: 'exact', label: 'Exact amount' },
  { value: 'percent', label: "% of the day's money" },
  { value: 'rest', label: 'The rest' },
] as const;

const getFundingAmount = (
  mode: AmountMode,
  text: string,
): FundingAmount | null => {
  if (mode === 'rest') return { kind: 'rest' };
  if (mode === 'percent') {
    const bps = parsePercentToBps(text);
    return bps === null ? null : { kind: 'percent', bps, of: 'dayMoney' };
  }
  const cents = parseMoneyToCents(text);
  return cents === null || cents <= 0 ? null : { kind: 'exact', cents };
};

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
const cadenceOptions = FUNDING_CADENCES.map((value) => ({
  value,
  label: FUNDING_CADENCE_LABELS[value],
}));

const EMPTY_ENVELOPE: EnvelopeSealed = {
  name: '',
  emoji: null,
  priority: 'should',
  orderIndex: 0,
  funding: {
    amount: { kind: 'exact', cents: 0 },
    cadence: { kind: 'everyIncomeDay' },
  },
};

const getEditingData = (payload: EnvelopeSealed): EnvelopeFormData => {
  const { amount, cadence, dayKeys } = toFundingInput(payload.funding);
  return {
    name: payload.name,
    priority: payload.priority,
    amount,
    cadence,
    dayKeys,
    emoji: payload.emoji,
  };
};

const INITIAL_DATA: EnvelopeFormData = {
  name: '',
  priority: null,
  amount: '',
  cadence: 'everyIncomeDay',
  dayKeys: [],
  emoji: null,
};

const getBlocker = (
  data: EnvelopeFormData,
  amount: FundingAmount | null,
  mode: AmountMode,
  hasDays: boolean,
) => {
  if (data.name.trim() === '') return 'Name the envelope.';
  if (data.priority === null) return 'Pick how much it matters.';
  if (amount === null)
    return mode === 'percent'
      ? 'Enter a whole or half percent, up to 100.'
      : 'Enter how much it gets each time.';
  if (data.cadence !== 'everyIncomeDay' && !hasDays)
    return 'Add an income source first, so there are days to count.';
  if (data.cadence === 'chosen' && data.dayKeys.length === 0)
    return 'Pick at least one day.';
  return null;
};

function EnvelopeForm({
  isOpen,
  onClose,
  title,
  editing,
  presetDayKey,
}: EnvelopeFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const [initialData] = useState<EnvelopeFormData>(() =>
    editing ? getEditingData(editing.payload) : INITIAL_DATA,
  );
  const [formData, setFormData] = useState<EnvelopeFormData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [amountMode, setAmountMode] = useState<AmountMode>(
    editing ? toFundingInput(editing.payload.funding).mode : 'exact',
  );
  const amount = getFundingAmount(amountMode, formData.amount);
  const blocker = getBlocker(
    formData,
    amount,
    amountMode,
    comingDays.length > 0,
  );

  const dayOptions = comingDays.map((day) => ({
    value: day.dayKey,
    label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));

  const fields = useMemo(() => {
    const result = [
      custom({
        name: 'name',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>Name</p>
            <Input
              variant='outline'
              aria-label='Name'
              placeholder='Groceries'
              maxLength={MAX_NAME_LENGTH}
              value={props.value as string}
              onChange={(event) => props.onValueChange(event.target.value)}
            />
          </div>
        ),
      }),
      custom({
        name: 'priority',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>How much it matters</p>
            <PillGroup
              label='How much it matters'
              options={priorityOptions}
              value={props.value as Priority | null}
              onChange={(value) => props.onValueChange(value)}
            />
          </div>
        ),
      }),
      custom({
        name: 'amount',
        label: '',
        renderComponent: (props) => (
          <AmountField
            label='Each time'
            hint='What it gets on each income day it is funded.'
            mode={amountMode}
            modes={AMOUNT_MODES}
            onModeChange={(mode) => {
              setAmountMode(mode);
              props.onValueChange('');
            }}
            percentOfLabel="of the day's money"
            restHint='Whatever is left of the day after the lines above it.'
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
      custom({
        name: 'cadence',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>Funded</p>
            <PillGroup
              label='Funded'
              options={cadenceOptions}
              value={props.value as Cadence}
              onChange={(value) => props.onValueChange(value)}
            />
          </div>
        ),
      }),
      ...(formData.cadence === 'chosen' && dayOptions.length > 0
        ? [
            custom({
              name: 'dayKeys',
              label: '',
              renderComponent: (props) => (
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>
                    Which income days
                  </p>
                  <MultiPillGroup
                    label='Which income days'
                    options={dayOptions}
                    values={props.value as string[]}
                    onChange={(values) =>
                      props.onValueChange(values.slice(0, MAX_CHOSEN_DAYS))
                    }
                  />
                </div>
              ),
            }),
          ]
        : []),
      custom({
        name: 'emoji',
        label: '',
        renderComponent: (props) => {
          const emoji = props.value as string | null;
          if (emoji === null) {
            return (
              <div>
                <RevealChip
                  icon={<Plus className='h-4 w-4' />}
                  onClick={() => props.onValueChange('')}
                >
                  Add emoji
                </RevealChip>
              </div>
            );
          }
          return (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>Emoji</p>
              <div className='flex items-center gap-2'>
                <div className='w-24 shrink-0'>
                  <Input
                    variant='outline'
                    aria-label='Emoji'
                    placeholder='🛒'
                    maxLength={MAX_EMOJI_LENGTH}
                    value={emoji}
                    onChange={(event) =>
                      props.onValueChange(event.target.value)
                    }
                  />
                </div>
                <RevealChip
                  icon={<X className='h-4 w-4' />}
                  onClick={() => props.onValueChange(null)}
                >
                  Remove emoji
                </RevealChip>
              </div>
            </div>
          );
        },
      }),
    ];
    return result;
  }, [amountMode, formData.cadence, dayOptions]);

  const buildFunding = (data: EnvelopeFormData, amount: FundingAmount) => {
    const saved = editing?.payload.funding.cadence;
    if (data.cadence === 'every2' || data.cadence === 'every3') {
      const n = data.cadence === 'every2' ? 2 : 3;
      const funding: FundingRule = {
        amount,
        cadence: {
          kind: 'everyNth',
          n,
          anchorDayKey:
            saved?.kind === 'everyNth' && saved.n === n
              ? saved.anchorDayKey
              : (comingDays[0]?.dayKey ?? ''),
        },
      };
      return funding;
    }
    if (data.cadence === 'chosen') {
      const chosen = new Set(data.dayKeys);
      const funding: FundingRule = {
        amount,
        cadence: {
          kind: 'chosen',
          dayKeys: comingDays
            .filter((day) => chosen.has(day.dayKey))
            .map((day) => day.dayKey),
        },
      };
      return funding;
    }
    const funding: FundingRule = {
      amount,
      cadence: { kind: 'everyIncomeDay' },
    };
    return funding;
  };

  const buildEnvelope = (data: EnvelopeFormData): EnvelopeSealed | null => {
    const amount = getFundingAmount(amountMode, data.amount);
    if (data.priority === null || amount === null) return null;

    const tier = envelopes.filter(
      (envelope) => envelope.version.payload.priority === data.priority,
    );
    const orderIndex =
      editing && editing.payload.priority === data.priority
        ? editing.payload.orderIndex
        : Math.max(
            0,
            ...tier.map((envelope) => envelope.version.payload.orderIndex),
          ) + ENVELOPE_ORDER_STEP;
    const result: EnvelopeSealed = {
      name: data.name.trim(),
      emoji: data.emoji?.trim() || null,
      priority: data.priority,
      orderIndex,
      funding: buildFunding(data, amount),
    };
    return result;
  };

  const candidate = blocker === null ? buildEnvelope(formData) : null;
  const flow = useChangeFlow({
    itemId: editing?.itemId ?? '',
    kind: 'envelope',
    current: editing?.payload ?? EMPTY_ENVELOPE,
    candidate,
    presetDayKey,
    onDone: onClose,
  });
  const editBlocker = flow.getBlocker(blocker);

  const handleSubmit = async (data: EnvelopeFormData) => {
    const envelope = buildEnvelope(data);
    if (!user || !envelope) return;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createEnvelope(user.uid, encryption, {
        startDate: today,
        envelope,
      });
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This envelope did not save. Nothing was changed.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const flowValue = {
    flow,
    itemId: editing?.itemId ?? '',
    kind: 'envelope' as const,
    candidate,
  };
  const formFields = editing ? [...fields, changeField] : fields;

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ChangeSteps
        isReason={flow.step === 'reason'}
        reason={<ChangeReason flow={flow} onClose={onClose} />}
      >
        <ChangeFlowContext value={flowValue}>
          <Form
            id='runway-envelope'
            form={formFields}
            initialData={initialData}
            columns={1}
            onDataChange={(data) => setFormData(data as EnvelopeFormData)}
            onSubmit={(data) => {
              if (editing) {
                flow.setStep('reason');
                return;
              }
              void handleSubmit(data as EnvelopeFormData);
            }}
            submitButton={
              <ModalFooterActions
                note={error ?? (editing ? editBlocker : blocker)}
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
                      isSaving || (editing ? editBlocker : blocker) !== null
                    }
                  >
                    {editing ? CHANGE_WORDS.review : 'Add'}
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

export default EnvelopeForm;
