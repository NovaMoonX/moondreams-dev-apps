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
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { parseMoneyToCents, parsePercentToBps } from '@/utils/moneyUtils';
import {
  ENVELOPE_ORDER_STEP,
  FUNDING_CADENCE_LABELS,
  FUNDING_CADENCES,
  LOOKAHEAD_MONTHS,
  MAX_CHOSEN_DAYS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { addUtcMonths, todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createGoal } from '@apps/runway/store/actions/itemActions';
import {
  selectComingDays,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { FundingAmount, FundingRule, Priority } from '@apps/runway/types';

type Cadence = (typeof FUNDING_CADENCES)[number];

interface GoalFormData {
  name: string;
  priority: Priority | null;
  target: string;
  /** Null until the person adds a date. */
  date: string | null;
  amount: string;
  cadence: Cadence;
  dayKeys: string[];
  /** Null until the person adds one. */
  emoji: string | null;
}

interface GoalFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
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

const INITIAL_DATA: GoalFormData = {
  name: '',
  priority: null,
  target: '',
  date: null,
  amount: '',
  cadence: 'everyIncomeDay',
  dayKeys: [],
  emoji: null,
};

const getBlocker = (
  data: GoalFormData,
  targetCents: number | null,
  amount: FundingAmount | null,
  mode: AmountMode,
  hasDays: boolean,
  today: number,
) => {
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  if (data.name.trim() === '') return 'Name the goal.';
  if (data.priority === null) return 'Pick how much it matters.';
  if (targetCents === null || targetCents <= 0)
    return 'Enter how much you are saving toward.';
  if (data.date !== null) {
    const date = fromDateInputValue(data.date);
    if (date === undefined || date < today)
      return 'Pick a date that has not passed, or remove it.';
    if (date > lastDate)
      return `Pick a date within the next ${LOOKAHEAD_MONTHS} months, which is as far as the income days are planned, or remove it.`;
  }
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

function GoalForm({ isOpen, onClose, title }: GoalFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [formData, setFormData] = useState<GoalFormData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [amountMode, setAmountMode] = useState<AmountMode>('exact');
  const amount = getFundingAmount(amountMode, formData.amount);
  const targetCents = parseMoneyToCents(formData.target);
  const blocker = getBlocker(
    formData,
    targetCents,
    amount,
    amountMode,
    comingDays.length > 0,
    today,
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
              placeholder='Vacation fund'
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
        name: 'target',
        label: '',
        renderComponent: (props) => (
          <AmountField
            label='Target'
            hint='How much you want to have saved.'
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
      custom({
        name: 'date',
        label: '',
        renderComponent: (props) => {
          const date = props.value as string | null;
          if (date === null) {
            return (
              <div>
                <RevealChip
                  icon={<Plus className='h-4 w-4' />}
                  onClick={() => props.onValueChange('')}
                >
                  Add a date
                </RevealChip>
              </div>
            );
          }
          return (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>Reach it by</p>
              <div className='flex flex-wrap items-center gap-2'>
                <div className='min-w-40 flex-1'>
                  <Input
                    type='date'
                    variant='outline'
                    aria-label='Reach it by'
                    min={toDateInputValue(today)}
                    max={toDateInputValue(
                      addUtcMonths(today, LOOKAHEAD_MONTHS),
                    )}
                    value={date}
                    onChange={(event) =>
                      props.onValueChange(event.target.value)
                    }
                  />
                </div>
                <RevealChip
                  icon={<X className='h-4 w-4' />}
                  onClick={() => props.onValueChange(null)}
                >
                  Remove date
                </RevealChip>
              </div>
            </div>
          );
        },
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
                    placeholder='🏖️'
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
  }, [amountMode, formData.cadence, dayOptions, today]);

  const buildFunding = (data: GoalFormData, amount: FundingAmount) => {
    const anchorDayKey = comingDays[0]?.dayKey ?? '';
    if (data.cadence === 'every2' || data.cadence === 'every3') {
      const funding: FundingRule = {
        amount,
        cadence: {
          kind: 'everyNth',
          n: data.cadence === 'every2' ? 2 : 3,
          anchorDayKey,
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

  const handleSubmit = async (data: GoalFormData) => {
    const amount = getFundingAmount(amountMode, data.amount);
    const target = parseMoneyToCents(data.target);
    if (!user || data.priority === null || amount === null || target === null)
      return;

    const tier = goals.filter(
      (goal) => goal.version.payload.priority === data.priority,
    );
    const orderIndex =
      Math.max(0, ...tier.map((goal) => goal.version.payload.orderIndex)) +
      ENVELOPE_ORDER_STEP;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createGoal(user.uid, encryption, {
        startDate: today,
        goal: {
          name: data.name.trim(),
          emoji: data.emoji?.trim() || null,
          priority: data.priority,
          orderIndex,
          targetCents: target,
          targetDate:
            data.date === null ? null : (fromDateInputValue(data.date) ?? null),
          funding: buildFunding(data, amount),
        },
      });
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This goal did not save. Nothing was changed.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <Form
        id='runway-goal'
        form={fields}
        initialData={INITIAL_DATA}
        columns={1}
        onDataChange={(data) => setFormData(data as GoalFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as GoalFormData);
        }}
        submitButton={
          <ModalFooterActions
            note={error ?? blocker}
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
                disabled={isSaving || blocker !== null}
              >
                Add
              </Button>
            }
          />
        }
      />
    </FormSheet>
  );
}

export default GoalForm;
