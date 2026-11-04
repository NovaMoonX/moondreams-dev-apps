import { useState } from 'react';
import { CalendarRange, Clock, Pin, Wallet } from 'lucide-react';

import { Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DateInput from '@/components/DateInput';
import { PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import HorizonChangeView from '@apps/runway/components/HorizonChangeView';
import {
  FORM_FLOW_WORDS,
  HORIZON_REST_OPTIONS,
  HORIZON_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import {
  selectBills,
  selectComingDays,
  selectEnvelopes,
  selectGoals,
  selectHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonRest, HorizonSealed, Priority } from '@apps/runway/types';

const REST_ICONS = {
  pays: <CalendarRange />,
  onePay: <Pin />,
  outside: <Wallet />,
  later: <Clock />,
} as const;

const MAX_PAY_CHOICES = 24;

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

interface HorizonChangeFormProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  onBack: () => void;
  onDone: () => void;
}

/** Change an event: its name, date, how the rest is paid and its priority. Its costs change in their own sheets. */
function HorizonChangeForm({
  itemId,
  horizon,
  today,
  onBack,
  onDone,
}: HorizonChangeFormProps) {
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const [name, setName] = useState(horizon.name);
  const [date, setDate] = useState(toDateInputValue(horizon.happensOn));
  const [isFewDays, setIsFewDays] = useState(horizon.happensUntil !== null);
  const [endDate, setEndDate] = useState(
    horizon.happensUntil === null ? '' : toDateInputValue(horizon.happensUntil),
  );
  const [rest, setRest] = useState<HorizonRest['kind']>(horizon.rest.kind);
  const [restDayKey, setRestDayKey] = useState<string | null>(
    horizon.rest.kind === 'onePay' ? horizon.rest.dayKey : null,
  );
  const [priority, setPriority] = useState<Priority>(horizon.priority);

  const trimmed = name.trim();
  const happensOn = fromDateInputValue(date);
  const happensUntil = fromDateInputValue(endDate);
  const isDateValid =
    happensOn !== undefined &&
    (happensOn === horizon.happensOn ||
      (happensOn >= today && happensOn <= lastDate));
  const isEndValid =
    !isFewDays ||
    (happensUntil !== undefined &&
      happensOn !== undefined &&
      happensUntil > happensOn);
  const lastCostOn = horizon.costs.reduce(
    (latest, { schedule }) => Math.max(latest, schedule.anchor ?? 0),
    0,
  );
  const allPayChoices = comingDays
    .filter((day) => day.on <= lastCostOn)
    .concat(comingDays.filter((day) => day.on > lastCostOn).slice(0, 1));
  const payChoices = allPayChoices.slice(0, MAX_PAY_CHOICES);
  const pickedDay = comingDays.find((day) => day.dayKey === restDayKey);
  const keptPick =
    horizon.rest.kind === 'onePay' && horizon.rest.dayKey === restDayKey;

  const getBlocker = () => {
    if (trimmed === '') return HORIZON_WORDS.needsName;
    if (!isDateValid) return FORM_FLOW_WORDS.pastDay;
    if (!isEndValid) return HORIZON_WORDS.endBeforeStart;
    if (rest === 'onePay' && pickedDay === undefined && !keptPick) {
      return HORIZON_WORDS.needsPay;
    }
    return null;
  };
  const blocker = getBlocker();

  const getRest = (): HorizonRest =>
    rest === 'onePay' && restDayKey !== null
      ? { kind: 'onePay', dayKey: restDayKey }
      : rest === 'onePay'
        ? horizon.rest
        : { kind: rest };
  const candidate: HorizonSealed | null =
    blocker !== null || happensOn === undefined
      ? null
      : {
          ...horizon,
          name: trimmed,
          happensOn,
          happensUntil:
            isFewDays && happensUntil !== undefined ? happensUntil : null,
          priority,
          orderIndex:
            priority === horizon.priority
              ? horizon.orderIndex
              : getNextTierRank(
                  [...bills, ...envelopes, ...goals, ...horizons].filter(
                    ({ item }) => item.id !== itemId,
                  ),
                  priority,
                ),
          rest: getRest(),
        };

  return (
    <HorizonChangeView
      itemId={itemId}
      backLabel={horizon.name}
      title={HORIZON_WORDS.changeItemTitle}
      current={horizon}
      candidate={candidate}
      blocker={blocker}
      onBack={onBack}
      onDone={onDone}
    >
      <div className='space-y-4'>
        <ActionSection caption={HORIZON_WORDS.name}>
          <Input
            variant='outline'
            aria-label={HORIZON_WORDS.name}
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </ActionSection>
        <ActionSection caption={HORIZON_WORDS.when}>
          <div className='space-y-2'>
            <DateInput
              variant='outline'
              aria-label={HORIZON_WORDS.when}
              min={toDateInputValue(Math.min(today, horizon.happensOn))}
              max={toDateInputValue(lastDate)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            {isFewDays ? (
              <>
                <DateInput
                  variant='outline'
                  aria-label={HORIZON_WORDS.endLabel}
                  min={date}
                  max={toDateInputValue(lastDate)}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
                <div>
                  <RevealChip
                    onClick={() => {
                      setIsFewDays(false);
                      setEndDate('');
                    }}
                  >
                    {HORIZON_WORDS.oneDay}
                  </RevealChip>
                </div>
              </>
            ) : (
              <div>
                <RevealChip onClick={() => setIsFewDays(true)}>
                  {HORIZON_WORDS.fewDays}
                </RevealChip>
              </div>
            )}
          </div>
        </ActionSection>
        <ActionSection caption={HORIZON_WORDS.rest}>
          <div className='space-y-3'>
            <ActionGroup isRoomy>
              {HORIZON_REST_OPTIONS.map(({ value, label, meaning }) => (
                <div
                  key={value}
                  className={join(
                    rest === value &&
                      'bg-primary/10 shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
                  )}
                  aria-current={rest === value ? 'true' : undefined}
                >
                  <ActionRow
                    isGrouped
                    isRoomy
                    icon={REST_ICONS[value]}
                    label={label}
                    subtitle={meaning}
                    onClick={() => setRest(value)}
                  />
                </div>
              ))}
            </ActionGroup>
            {rest === 'onePay' &&
              (payChoices.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  {HORIZON_WORDS.noPays}
                </p>
              ) : (
                <PillGroup
                  label={HORIZON_WORDS.onePayTitle}
                  options={payChoices.map((day) => ({
                    value: day.dayKey,
                    label: HORIZON_WORDS.onePayLabel(
                      formatDateOrdinalUTC(day.on),
                      day.sourceName ?? day.payLineName,
                    ),
                  }))}
                  value={restDayKey}
                  onChange={setRestDayKey}
                />
              ))}
          </div>
        </ActionSection>
        <ActionSection caption={HORIZON_WORDS.priority}>
          <PillGroup
            label={FORM_FLOW_WORDS.priority}
            options={priorityOptions}
            value={priority}
            onChange={setPriority}
          />
        </ActionSection>
      </div>
    </HorizonChangeView>
  );
}

export default HorizonChangeForm;
