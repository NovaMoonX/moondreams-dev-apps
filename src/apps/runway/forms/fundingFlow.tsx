import type { ReactNode } from 'react';

import AmountField, { type AmountMode } from '@/components/AmountField';
import HelpTip from '@/components/HelpTip';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import type { QuestionStep } from '@/hooks/useQuestionFlow';
import { formatDateUTC } from '@/utils/formatUtils';
import { parseMoneyToCents, parsePercentToBps } from '@/utils/moneyUtils';
import {
  CALENDAR_PERIOD_LABELS,
  CALENDAR_PERIOD_UNITS,
  CALENDAR_PERIODS,
  FORM_FLOW_WORDS,
  FUNDING_CADENCE_LABELS,
  HOW_OFTEN_WORDS,
  MAX_CHOSEN_DAYS,
} from '@apps/runway/constants';
import type { ComingDay } from '@apps/runway/engine/comingDays';
import type { FundingAmount, FundingRule } from '@apps/runway/types';
import { toFundingInput, type HowOften } from '@apps/runway/utils/fundingInput';
import { describeAmount } from '@apps/runway/utils/fundingText';

type PaycheckCadence = ReturnType<typeof toFundingInput>['cadence'];

/** What an envelope's or goal's funding questions hold while they are answered. */
export interface FundingFormData {
  often: HowOften;
  /** Dollars for one period, for one pay, or the percentage, as typed. */
  amount: string;
  mode: AmountMode;
  cadence: PaycheckCadence;
  dayKeys: string[];
  /** The income source a paycheck rule counts; null counts every source. */
  sourceId: string | null;
}

export const INITIAL_FUNDING_FORM: FundingFormData = {
  often: 'monthly',
  amount: '',
  mode: 'exact',
  cadence: 'everyIncomeDay',
  dayKeys: [],
  sourceId: null,
};

export const toFundingForm = (funding: FundingRule): FundingFormData => {
  const { amount, mode, often, cadence, dayKeys, sourceId } =
    toFundingInput(funding);
  return { often, amount, mode, cadence, dayKeys, sourceId };
};

const PAYCHECK_MODES = [
  {
    value: 'exact',
    label: 'Exact amount',
    linkLabel: FORM_FLOW_WORDS.exactLink,
  },
  {
    value: 'percent',
    label: '% of each pay',
    linkLabel: FORM_FLOW_WORDS.percentLink,
  },
  { value: 'rest', label: 'The rest', linkLabel: FORM_FLOW_WORDS.restLink },
] as const;

const isCalendar = (
  often: HowOften,
): often is (typeof CALENDAR_PERIODS)[number] =>
  often !== 'paycheck' && often !== 'none';

/** The amount the person typed as a funding amount; null while it is not usable. */
export const getFundingAmount = (
  data: FundingFormData,
): FundingAmount | null => {
  if (data.often === 'none') return { kind: 'exact', cents: 0 };
  const mode = isCalendar(data.often) ? 'exact' : data.mode;
  if (mode === 'rest') return { kind: 'rest' };
  if (mode === 'percent') {
    const bps = parsePercentToBps(data.amount);
    return bps === null ? null : { kind: 'percent', bps, of: 'dayMoney' };
  }
  const cents = parseMoneyToCents(data.amount);
  return cents === null || cents <= 0 ? null : { kind: 'exact', cents };
};

/** The rule the answers make. A calendar rule keeps the day it started on while its period and amount are unchanged. */
export function buildFundingRule(
  data: FundingFormData,
  context: {
    comingDays: readonly ComingDay[];
    saved?: FundingRule;
    today: number;
  },
): FundingRule | null {
  const amount = getFundingAmount(data);
  if (amount === null) return null;
  const { comingDays, saved, today } = context;
  if (data.often === 'none') {
    return { amount, cadence: { kind: 'none' } };
  }
  if (isCalendar(data.often)) {
    const isSame =
      saved?.cadence.kind === 'calendar' &&
      saved.cadence.period === data.often &&
      saved.amount.kind === 'exact' &&
      amount.kind === 'exact' &&
      saved.amount.cents === amount.cents;
    return {
      amount,
      cadence: {
        kind: 'calendar',
        period: data.often,
        startsOn:
          isSame && saved.cadence.kind === 'calendar'
            ? saved.cadence.startsOn
            : today,
      },
    };
  }
  const source = data.sourceId === null ? {} : { sourceId: data.sourceId };
  const savedCadence = saved?.cadence;
  if (data.cadence === 'every2' || data.cadence === 'every3') {
    const n = data.cadence === 'every2' ? 2 : 3;
    return {
      amount,
      cadence: {
        kind: 'everyNth',
        n,
        anchorDayKey:
          savedCadence?.kind === 'everyNth' && savedCadence.n === n
            ? savedCadence.anchorDayKey
            : (comingDays[0]?.dayKey ?? ''),
      },
      ...source,
    };
  }
  if (data.cadence === 'chosen') {
    const chosen = new Set(data.dayKeys);
    return {
      amount,
      cadence: {
        kind: 'chosen',
        dayKeys: comingDays
          .filter((day) => chosen.has(day.dayKey))
          .map((day) => day.dayKey),
      },
      ...source,
    };
  }
  return { amount, cadence: { kind: 'everyIncomeDay' }, ...source };
}

/** What stops the answers from being saved, in the footer's words; null when they can be. */
export function getFundingBlocker(
  data: FundingFormData,
  hasDays: boolean,
): string | null {
  if (data.often === 'none') return null;
  if (data.often === 'paycheck' && !hasDays) return HOW_OFTEN_WORDS.needsIncome;
  if (data.often === 'paycheck' && data.cadence === 'chosen') {
    if (data.dayKeys.length === 0) return FORM_FLOW_WORDS.pickDays;
  }
  if (getFundingAmount(data) === null) {
    if (data.often !== 'paycheck') return HOW_OFTEN_WORDS.badAmount;
    return data.mode === 'percent'
      ? FORM_FLOW_WORDS.badPercent
      : 'Enter how much it gets from each pay.';
  }
  return null;
}

/** The id a drafted income source goes by until it is written to a plan. */
export const toDraftSourceId = (name: string) =>
  `draft:${name.trim().toLowerCase()}`;

const getSources = (
  comingDays: readonly ComingDay[],
  savedId: string | null,
  draftSources?: readonly { id: string; name: string }[],
) => {
  if (draftSources !== undefined) return [...draftSources];
  const found = new Map(
    comingDays.flatMap((day): [string, string][] =>
      day.sourceId !== null && day.sourceName !== null
        ? [[day.sourceId, day.sourceName]]
        : [],
    ),
  );
  if (savedId !== null && !found.has(savedId)) {
    found.set(savedId, HOW_OFTEN_WORDS.unnamedSource);
  }
  return [...found.entries()].map(([id, name]) => ({ id, name }));
};

const ALL_SOURCES = 'all';

/** "Each Northwind Studio pay" for a source, "Each pay, all sources" for none. */
export const describeSource = (
  comingDays: readonly ComingDay[],
  sourceId: string | null,
) => {
  const source = getSources(comingDays, sourceId).find(
    (entry) => entry.id === sourceId,
  );
  return source === undefined
    ? HOW_OFTEN_WORDS.allSources
    : HOW_OFTEN_WORDS.eachSource(source.name);
};

/** The amount as the folded row says it: "$600.00 a month", "10% of each pay". */
export function describeFormAmount(
  data: FundingFormData,
  amount: FundingAmount | null,
) {
  if (amount === null) return '';
  if (data.often === 'none') return HOW_OFTEN_WORDS.noAddingSummary;
  if (isCalendar(data.often)) {
    return `${describeAmount(amount)} ${CALENDAR_PERIOD_UNITS[data.often]}`;
  }
  if (amount.kind === 'rest') return HOW_OFTEN_WORDS.restTitle;
  if (amount.kind === 'exact') return `${describeAmount(amount)} each pay`;
  return describeAmount(amount);
}

interface FundingStepsArgs {
  data: FundingFormData;
  set: (patch: Partial<FundingFormData>) => void;
  comingDays: readonly ComingDay[];
  /** A goal may be saved with nothing going into it. */
  allowNone: boolean;
  /** The question over a calendar amount, in the form's own words, given "a month", "every 2 weeks" and the like. */
  getAmountTitle: (unit: string) => string;
  /** One quiet line under the amount, when the form has something to suggest. */
  getAmountHint?: (data: FundingFormData) => ReactNode;
  /** Nothing is saved yet, so income days are assumed and the ones to pick from are not offered. */
  isDraft?: boolean;
  /** The drafted income sources, when nothing is saved yet. */
  draftSources?: readonly { id: string; name: string }[];
}

/** The "How often?", "Which pays?" and amount questions an envelope's and a goal's forms share. */
export function buildFundingSteps({
  data,
  set,
  comingDays,
  allowNone,
  getAmountTitle,
  getAmountHint,
  isDraft = false,
  draftSources,
}: FundingStepsArgs): QuestionStep[] {
  const hasDays = comingDays.length > 0 || isDraft;
  const amount = getFundingAmount(data);
  const sources = getSources(comingDays, data.sourceId, draftSources);
  const selectedSource = sources.find((source) => source.id === data.sourceId);
  const oftenOptions = [
    ...CALENDAR_PERIODS.map((value) => ({
      value: value as HowOften,
      label: CALENDAR_PERIOD_LABELS[value],
    })),
    { value: 'paycheck' as HowOften, label: HOW_OFTEN_WORDS.paycheck },
    ...(allowNone
      ? [{ value: 'none' as HowOften, label: HOW_OFTEN_WORDS.none }]
      : []),
  ];
  const sourceOptions = [
    { value: ALL_SOURCES, label: HOW_OFTEN_WORDS.allSources },
    ...sources.map((source) => ({
      value: source.id,
      label: HOW_OFTEN_WORDS.eachSource(source.name),
    })),
  ];
  const oftenText =
    data.often === 'paycheck' && selectedSource !== undefined
      ? HOW_OFTEN_WORDS.eachSource(selectedSource.name)
      : data.often === 'paycheck'
        ? HOW_OFTEN_WORDS.paycheck
        : data.often === 'none'
          ? HOW_OFTEN_WORDS.none
          : CALENDAR_PERIOD_LABELS[data.often];
  const isPaycheck = data.often === 'paycheck';
  const periodAnswered = !isPaycheck || hasDays;

  const often: QuestionStep = {
    id: 'often',
    title: allowNone ? 'How often does money go in?' : HOW_OFTEN_WORDS.title,
    summaryLabel: HOW_OFTEN_WORDS.caption,
    summaryValue: oftenText,
    isAnswered: periodAnswered,
    blocker: HOW_OFTEN_WORDS.needsIncome,
    render: ({ moveOn }) => (
      <div className='space-y-3'>
        <PillGroup
          label={HOW_OFTEN_WORDS.caption}
          options={oftenOptions}
          value={data.often}
          onChange={(value) => {
            set({
              often: value,
              amount: value === data.often ? data.amount : '',
            });
            if (value === 'paycheck' || value === 'none') return;
            moveOn();
          }}
        />
        {isPaycheck && sources.length > 0 && (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>
              {HOW_OFTEN_WORDS.fromWhich}
            </p>
            <PillGroup
              label={HOW_OFTEN_WORDS.fromWhich}
              options={sourceOptions}
              value={data.sourceId ?? ALL_SOURCES}
              onChange={(value) =>
                set({ sourceId: value === ALL_SOURCES ? null : value })
              }
            />
          </div>
        )}
      </div>
    ),
  };

  const pays: QuestionStep = {
    id: 'cadence',
    title: FORM_FLOW_WORDS.cadenceTitle,
    summaryLabel: FORM_FLOW_WORDS.cadence,
    summaryValue:
      data.cadence === 'chosen'
        ? `${FUNDING_CADENCE_LABELS.chosen} · ${data.dayKeys.length}`
        : FUNDING_CADENCE_LABELS[data.cadence],
    isAnswered:
      hasDays && (data.cadence !== 'chosen' || data.dayKeys.length > 0),
    blocker: !hasDays ? HOW_OFTEN_WORDS.needsIncome : FORM_FLOW_WORDS.pickDays,
    isPreAnswered: true,
    render: ({ moveOn }) => (
      <div className='space-y-3'>
        <PillGroup
          label={FORM_FLOW_WORDS.cadence}
          options={(isDraft
            ? (['everyIncomeDay', 'every2', 'every3'] as const)
            : (['everyIncomeDay', 'every2', 'every3', 'chosen'] as const)
          ).map((value) => ({
            value,
            label: FUNDING_CADENCE_LABELS[value],
          }))}
          value={data.cadence}
          onChange={(cadence) => {
            set({ cadence });
            if (cadence !== 'chosen' && hasDays) moveOn();
          }}
        />
        {data.cadence === 'chosen' && hasDays && (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>Which pays</p>
            <MultiPillGroup
              label='Which pays'
              options={comingDays.map((day) => ({
                value: day.dayKey,
                label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
              }))}
              values={data.dayKeys}
              onChange={(values) =>
                set({ dayKeys: values.slice(0, MAX_CHOSEN_DAYS) })
              }
            />
          </div>
        )}
      </div>
    ),
  };

  const sourcePay =
    selectedSource === undefined
      ? HOW_OFTEN_WORDS.percentOf
      : HOW_OFTEN_WORDS.percentOfSource(selectedSource.name);
  const amountStep: QuestionStep = {
    id: 'amount',
    title: isCalendar(data.often)
      ? getAmountTitle(CALENDAR_PERIOD_UNITS[data.often])
      : HOW_OFTEN_WORDS.paycheckAmountTitle,
    summaryLabel: FORM_FLOW_WORDS.amount,
    summaryValue: describeFormAmount(data, amount),
    isAnswered: amount !== null,
    blocker:
      data.amount.trim() === '' && data.mode !== 'rest'
        ? null
        : data.mode === 'percent' && isPaycheck
          ? FORM_FLOW_WORDS.badPercent
          : FORM_FLOW_WORDS.badAmount,
    render: () => (
      <AmountField
        isHero
        label={HOW_OFTEN_WORDS.perPeriodLabel}
        mode={isPaycheck ? data.mode : 'exact'}
        modes={isPaycheck ? PAYCHECK_MODES : undefined}
        onModeChange={(mode) => set({ mode, amount: '' })}
        percentOfLabel={sourcePay}
        restHint=''
        value={data.amount}
        onChange={(value) => set({ amount: value })}
        hint={getAmountHint?.(data)}
        suffix={
          isCalendar(data.often) ? (
            CALENDAR_PERIOD_UNITS[data.often]
          ) : isPaycheck && data.mode === 'rest' ? (
            <span className='inline-flex items-center gap-1'>
              {HOW_OFTEN_WORDS.restTitle}
              <HelpTip title={HOW_OFTEN_WORDS.restTitle}>
                {HOW_OFTEN_WORDS.restHelp}
              </HelpTip>
            </span>
          ) : isPaycheck ? (
            describeSource(comingDays, data.sourceId)
          ) : undefined
        }
      />
    ),
  };

  const result = [
    often,
    ...(isPaycheck ? [pays] : []),
    ...(data.often === 'none' ? [] : [amountStep]),
  ];
  return result;
}
