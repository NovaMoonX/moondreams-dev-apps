import { useRef, useState } from 'react';
import { CalendarRange, Clock, Pin, Plus, Wallet } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import AmountHero from '@/components/AmountHero';
import DateInput from '@/components/DateInput';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { generateUuid } from '@/utils/idUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  FORM_FLOW_WORDS,
  HORIZON_REST_OPTIONS,
  HORIZON_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_EMOJI_LENGTH,
  MAX_HORIZON_COSTS,
  MAX_NAME_LENGTH,
  MAX_PURCHASE_CENTS,
  MOVE_WORDS,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import CostRow from '@apps/runway/components/CostRow';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { addUtcMonths, todayAsUtcDate } from '@apps/runway/engine/dates';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import CostForm from '@apps/runway/forms/CostForm';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { addHorizon } from '@apps/runway/store/actions/horizonActions';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';
import { newTransferMoveId } from '@apps/runway/store/actions/transferActions';
import type {
  ItemShortsReading,
  PreviewChange,
} from '@apps/runway/store/selectors/previewSelectors';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectBills,
  selectComingDays,
  selectEnvelopes,
  selectGoals,
  selectHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  HorizonCost,
  HorizonRest,
  HorizonSealed,
  Priority,
} from '@apps/runway/types';
import { formatDateRangeOrdinalUTC } from '@apps/runway/utils/horizonText';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';

interface HorizonFormData {
  name: string;
  /** Null until the person adds one. */
  emoji: string | null;
  date: string;
  isFewDays: boolean;
  endDate: string;
  costs: HorizonCost[];
  /** The amount typed for "Put money toward it now?". */
  putAmount: string;
  putFrom: 'free' | 'place' | null;
  putPlaceId: string | null;
  /** "Not now" was chosen: the question is answered with no money. */
  isNotNow: boolean;
  /** Null until the person picks one. */
  rest: HorizonRest['kind'] | null;
  /** The pay "One pay I pick" names; null until picked. */
  restDayKey: string | null;
  priority: Priority;
}

const INITIAL_DATA: HorizonFormData = {
  name: '',
  emoji: null,
  date: '',
  isFewDays: false,
  endDate: '',
  costs: [],
  putAmount: '',
  putFrom: null,
  putPlaceId: null,
  isNotNow: false,
  rest: null,
  restDayKey: null,
  priority: 'should',
};

const FROM_OPTIONS = [
  { value: 'free' as const, label: HORIZON_WORDS.putFromFree },
  { value: 'place' as const, label: HORIZON_WORDS.putFromPlace },
  { value: 'none' as const, label: HORIZON_WORDS.putNotNow },
];

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

interface HorizonFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

/** Add to your horizon: an event, when it happens and what it will cost. */
function HorizonForm({ isOpen, onClose, title }: HorizonFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const balances = useAppSelector(selectBalances);
  const emojiOf = useLiveEmojiResolver();
  const { isHidden } = useValuesHidden();
  const [moveId] = useState(newTransferMoveId);
  const [horizonId] = useState(generateUuid);
  const [formData, setFormData] = useState<HorizonFormData>(INITIAL_DATA);
  const [costDraft, setCostDraft] = useState<HorizonCost | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const addCostRef = useRef<HTMLButtonElement>(null);
  const payPillsRef = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<HorizonFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const name = formData.name.trim();
  const date = fromDateInputValue(formData.date);
  const endDate = fromDateInputValue(formData.endDate);
  const isDateValid = date !== undefined && date >= today && date <= lastDate;
  const isEndValid =
    !formData.isFewDays ||
    (endDate !== undefined && date !== undefined && endDate > date);
  const getDateBlocker = () => {
    if (formData.date !== '' && !isDateValid) return FORM_FLOW_WORDS.pastDay;
    if (formData.isFewDays && formData.endDate !== '' && !isEndValid)
      return HORIZON_WORDS.endBeforeStart;
    return null;
  };
  const dateBlocker = getDateBlocker();
  const places = [
    ...envelopes.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      emoji: emojiOf(version.payload.emoji, version.payload.groupId),
    })),
    ...goals
      .filter(({ version }) => version.payload.state !== 'paused')
      .map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        emoji: version.payload.emoji,
      })),
  ];
  const place = places.find(({ id }) => id === formData.putPlaceId);
  const parsedPut = parseMoneyToCents(formData.putAmount);
  const putCents =
    parsedPut !== null && parsedPut > 0 && parsedPut <= MAX_PURCHASE_CENTS
      ? parsedPut
      : null;
  const putFromName =
    formData.putFrom === 'free' ? HORIZON_WORDS.putFreeName : place?.name;
  const putLeftCents =
    formData.putFrom === 'place'
      ? Math.max(0, balances.assignedByItem[place?.id ?? ''] ?? 0)
      : formData.putFrom === 'free' && balances.hasMoney
        ? Math.max(0, balances.freeToSpendCents)
        : Infinity;
  const getPutBlocker = () => {
    if (formData.isNotNow) return null;
    if (putCents === null) return HORIZON_WORDS.needsPutAmount;
    if (formData.putFrom === null) return HORIZON_WORDS.needsPutFrom;
    if (putFromName === undefined) return HORIZON_WORDS.needsPutPlace;
    if (putCents > putLeftCents) return HORIZON_WORDS.putTooMuch(putFromName);
    return null;
  };
  const putBlocker = getPutBlocker();
  const lastCostOn = formData.costs.reduce(
    (latest, { schedule }) => Math.max(latest, schedule.anchor ?? 0),
    0,
  );
  const allPayChoices = comingDays
    .filter((day) => day.on <= lastCostOn)
    .concat(comingDays.filter((day) => day.on > lastCostOn).slice(0, 1));
  const payChoices = allPayChoices.slice(0, MAX_PAY_CHOICES);
  const pickedDay = comingDays.find(
    (day) => day.dayKey === formData.restDayKey,
  );
  const getRest = (): HorizonRest | null => {
    if (formData.rest === 'onePay')
      return pickedDay ? { kind: 'onePay', dayKey: pickedDay.dayKey } : null;
    return formData.rest === null ? null : { kind: formData.rest };
  };
  const rest = getRest();
  const getHorizon = (
    happensOn: number,
    restValue: HorizonRest,
  ): HorizonSealed => ({
    name,
    emoji: formData.emoji?.trim() || null,
    happensOn,
    happensUntil: formData.isFewDays && endDate !== undefined ? endDate : null,
    priority: formData.priority,
    orderIndex: getNextTierRank(
      [...bills, ...envelopes, ...goals, ...horizons],
      formData.priority,
    ),
    rest: restValue,
    note: null,
    costs: formData.costs,
  });
  const blocker =
    name === ''
      ? HORIZON_WORDS.needsName
      : !isDateValid || !isEndValid
        ? (dateBlocker ?? FORM_FLOW_WORDS.pastDay)
        : formData.costs.length === 0
          ? HORIZON_WORDS.needsCost
          : putBlocker !== null
            ? putBlocker
            : formData.rest === null
              ? HORIZON_WORDS.needsRest
              : formData.rest === 'onePay' && pickedDay === undefined
                ? HORIZON_WORDS.needsPay
                : null;

  const isPaysAsked = rest?.kind === 'pays' || rest?.kind === 'onePay';
  const previewJson =
    isPaysAsked && blocker === null && date !== undefined
      ? JSON.stringify({
          kind: 'addItem',
          item: {
            id: horizonId,
            kind: 'horizon',
            parentId: null,
            createdAt: today,
            endedAt: null,
            archivedAt: null,
            heldReleasedOn: null,
          },
          version: {
            itemId: horizonId,
            kind: 'horizon',
            effectiveFrom: today,
            effectiveUntil: null,
            changeId: 'what-if',
            payload: getHorizon(date, rest),
          },
          heldCents: formData.isNotNow ? 0 : (putCents ?? 0),
        } satisfies PreviewChange)
      : null;

  const pickedOn = pickedDay?.on ?? null;
  const shortNote = {
    itemId: horizonId,
    describe: ({ shorts, payCount, roomCount }: ItemShortsReading) => {
      const total = shorts.reduce((sum, entry) => sum + entry.cents, 0);
      if (total === 0) return null;
      return pickedOn !== null && formData.rest === 'onePay'
        ? HORIZON_WORDS.effectShortOnePay(formatDateOrdinalUTC(pickedOn))
        : HORIZON_WORDS.effectShortPays(
            name,
            formatCents(total),
            roomCount,
            payCount,
          );
    },
  };

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: HORIZON_WORDS.nameTitle,
      summaryLabel: HORIZON_WORDS.name,
      summaryValue: `${formData.emoji?.trim() ?? ''} ${name}`.trim(),
      isAnswered: name !== '',
      render: () => (
        <div className='space-y-4'>
          <Input
            variant='outline'
            aria-label={HORIZON_WORDS.name}
            placeholder={HORIZON_WORDS.namePlaceholder}
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          {formData.emoji === null ? (
            <div>
              <RevealChip
                icon={<Plus className='h-4 w-4' aria-hidden='true' />}
                onClick={() => set({ emoji: '' })}
              >
                {HORIZON_WORDS.addEmoji}
              </RevealChip>
            </div>
          ) : (
            <EmojiField
              value={formData.emoji}
              onChange={(emoji) => set({ emoji })}
              ariaLabel={FORM_FLOW_WORDS.emoji}
              placeholder='📦'
              maxLength={MAX_EMOJI_LENGTH}
            />
          )}
        </div>
      ),
    },
    {
      id: 'when',
      title: HORIZON_WORDS.whenTitle,
      summaryLabel: HORIZON_WORDS.when,
      summaryValue:
        !isDateValid || !isEndValid
          ? ''
          : formData.isFewDays && endDate !== undefined
            ? HORIZON_WORDS.aroundRange(
                formatDateRangeOrdinalUTC(date, endDate),
              )
            : HORIZON_WORDS.around(formatDateOrdinalUTC(date)),
      isAnswered: isDateValid && isEndValid,
      blocker: dateBlocker,
      render: () => (
        <div className='space-y-3'>
          <div className='space-y-1'>
            {formData.isFewDays && (
              <label
                htmlFor='horizon-from'
                className='text-muted-foreground block text-sm font-medium'
              >
                {HORIZON_WORDS.startLabel}
              </label>
            )}
            <DateInput
              id='horizon-from'
              variant='outline'
              aria-label={formData.isFewDays ? undefined : HORIZON_WORDS.when}
              min={toDateInputValue(today)}
              max={toDateInputValue(lastDate)}
              value={formData.date}
              onChange={(event) => set({ date: event.target.value })}
            />
          </div>
          {formData.isFewDays ? (
            <>
              <div className='space-y-1'>
                <label
                  htmlFor='horizon-to'
                  className='text-muted-foreground block text-sm font-medium'
                >
                  {HORIZON_WORDS.endLabel}
                </label>
                <DateInput
                  id='horizon-to'
                  variant='outline'
                  min={formData.date}
                  max={toDateInputValue(lastDate)}
                  value={formData.endDate}
                  onChange={(event) => set({ endDate: event.target.value })}
                />
              </div>
              <div>
                <RevealChip
                  onClick={() => set({ isFewDays: false, endDate: '' })}
                >
                  {HORIZON_WORDS.oneDay}
                </RevealChip>
              </div>
            </>
          ) : (
            <div>
              <RevealChip onClick={() => set({ isFewDays: true })}>
                {HORIZON_WORDS.fewDays}
              </RevealChip>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'costs',
      title: HORIZON_WORDS.costsTitle,
      summaryLabel: HORIZON_WORDS.costs,
      summaryValue:
        formData.costs.length === 0
          ? ''
          : formData.costs.length === 1
            ? formData.costs[0].name
            : HORIZON_WORDS.costCount(formData.costs.length),
      isAnswered: formData.costs.length > 0,
      render: () => (
        <div className='space-y-3'>
          {formData.costs.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.noCosts}
            </p>
          ) : (
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {formData.costs.map((cost) => (
                <CostRow
                  key={cost.id}
                  cost={cost}
                  onOpen={() => setCostDraft(cost)}
                />
              ))}
            </ul>
          )}
          <Button
            ref={addCostRef}
            type='button'
            variant='secondary'
            disabled={formData.costs.length >= MAX_HORIZON_COSTS}
            onClick={() => setCostDraft('new')}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            {HORIZON_WORDS.addCost}
          </Button>
          {formData.costs.length >= MAX_HORIZON_COSTS && (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.maxCosts(MAX_HORIZON_COSTS)}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'put',
      title: HORIZON_WORDS.putTitle,
      summaryLabel: HORIZON_WORDS.putTitle,
      summaryValue: formData.isNotNow
        ? HORIZON_WORDS.putNotNow
        : putBlocker === null && putCents !== null && putFromName
          ? HORIZON_WORDS.putSummary(formatCents(putCents), putFromName)
          : '',
      isAnswered: putBlocker === null,
      blocker:
        putBlocker !== null &&
        formData.putAmount === '' &&
        formData.putFrom === null
          ? HORIZON_WORDS.needsPutOrNotNow
          : putBlocker,
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <AmountHero
            autoFocus
            label={HORIZON_WORDS.putAmount}
            value={formData.putAmount}
            onChange={(putAmount) => set({ putAmount, isNotNow: false })}
          />
          <PillGroup
            label={HORIZON_WORDS.putFrom}
            options={FROM_OPTIONS}
            value={formData.isNotNow ? 'none' : formData.putFrom}
            onChange={(putFrom) => {
              if (putFrom === 'none') {
                set({
                  putAmount: '',
                  putFrom: null,
                  putPlaceId: null,
                  isNotNow: true,
                });
                moveOn();
                return;
              }
              set({ putFrom, isNotNow: false, putPlaceId: null });
            }}
          />
          {formData.putFrom === 'place' && (
            <PillGroup
              label={HORIZON_WORDS.putPlaces}
              options={places.map(({ id, name: placeName, emoji }) => ({
                value: id,
                label: placeName,
                emoji: emoji ?? undefined,
              }))}
              value={formData.putPlaceId}
              onChange={(putPlaceId) => set({ putPlaceId, isNotNow: false })}
            />
          )}
          {putFromName !== undefined && putLeftCents !== Infinity && (
            <p className='text-muted-foreground text-sm'>
              <MaskedText>
                {HORIZON_WORDS.putHolds(putFromName, formatCents(putLeftCents))}
              </MaskedText>
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'rest',
      title: HORIZON_WORDS.restTitle,
      summaryLabel: HORIZON_WORDS.rest,
      summaryValue:
        formData.rest === 'onePay'
          ? pickedDay
            ? HORIZON_WORDS.restOnePaySummary(
                formatDateOrdinalUTC(pickedDay.on),
              )
            : ''
          : (HORIZON_REST_OPTIONS.find(({ value }) => value === formData.rest)
              ?.label ?? ''),
      isAnswered: rest !== null,
      blocker: formData.rest === 'onePay' ? HORIZON_WORDS.needsPay : null,
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <ActionGroup isRoomy>
            {HORIZON_REST_OPTIONS.map(({ value, label, meaning }) => (
              <div
                key={value}
                className={join(formData.rest === value && 'bg-primary/10')}
                aria-current={formData.rest === value ? 'true' : undefined}
              >
                <ActionRow
                  isGrouped
                  isRoomy
                  icon={REST_ICONS[value]}
                  label={label}
                  subtitle={meaning}
                  onClick={() => {
                    set({ rest: value, restDayKey: null });
                    if (value !== 'onePay') {
                      moveOn();
                      return;
                    }
                    requestAnimationFrame(() =>
                      payPillsRef.current?.scrollIntoView({
                        block: 'nearest',
                        behavior: 'smooth',
                      }),
                    );
                  }}
                />
              </div>
            ))}
          </ActionGroup>
          {formData.rest === 'onePay' &&
            (payChoices.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {HORIZON_WORDS.noPays}
              </p>
            ) : (
              <div ref={payPillsRef} className='scroll-mb-32 space-y-2'>
                <p aria-hidden='true' className='text-sm font-medium'>
                  {HORIZON_WORDS.onePayTitle}
                </p>
                <PillGroup
                  label={HORIZON_WORDS.onePayTitle}
                  options={payChoices.map((day) => ({
                    value: day.dayKey,
                    label: HORIZON_WORDS.onePayLabel(
                      formatDateOrdinalUTC(day.on),
                      day.sourceName ?? day.payLineName,
                    ),
                  }))}
                  value={formData.restDayKey}
                  onChange={(restDayKey) => {
                    set({ restDayKey });
                    moveOn();
                  }}
                />
                {allPayChoices.length > payChoices.length && (
                  <p className='text-muted-foreground text-sm'>
                    {HORIZON_WORDS.onePayCapped}
                  </p>
                )}
              </div>
            ))}
        </div>
      ),
    },
    {
      id: 'priority',
      title: FORM_FLOW_WORDS.priorityTitle,
      summaryLabel: HORIZON_WORDS.priority,
      summaryValue: PRIORITY_LABELS[formData.priority],
      isAnswered: true,
      isPreAnswered: true,
      render: ({ moveOn }) => (
        <PillGroup
          label={FORM_FLOW_WORDS.priority}
          options={priorityOptions}
          value={formData.priority}
          onChange={(priority) => {
            set({ priority });
            moveOn();
          }}
        />
      ),
    },
  ];
  const questions = useQuestionFlow({ steps: maskSummaries(steps, isHidden) });

  const requestClose = useDiscardGuard({
    isDirty: JSON.stringify(formData) !== JSON.stringify(INITIAL_DATA),
    onClose,
    isBusy: isSaving,
    title: FORM_FLOW_WORDS.discardNew(HORIZON_WORDS.discardNoun),
  });

  const handleSubmit = async () => {
    if (!user || blocker !== null || date === undefined || rest === null) {
      return;
    }
    const horizon = getHorizon(date, rest);
    const toward =
      formData.isNotNow || putCents === null || putFromName === undefined
        ? null
        : {
            moveId,
            fromId: formData.putFrom === 'place' ? (place?.id ?? null) : null,
            cents: putCents,
            leftCents: putLeftCents === Infinity ? 0 : putLeftCents,
            summary: HORIZON_WORDS.putAdded(
              formatCents(putCents),
              putFromName,
              name,
            ),
            undoText: HORIZON_WORDS.putUndone(
              formatCents(putCents),
              name,
              putFromName,
            ),
          };
    if (toward !== null && !navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await addHorizon(user.uid, encryption, {
        horizonId,
        horizon,
        startDate: today,
        toward,
      });
      onClose();
    } catch (saveError) {
      setError(
        toward !== null && isOfflineFailure(saveError)
          ? MOVE_WORDS.offline
          : getErrorMessage(saveError, HORIZON_WORDS.addFailed),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={title}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        <QuestionFlow flow={questions} />
        {questions.hasReviewed && previewJson !== null && (
          <EffectPreview
            changeJson={previewJson}
            emptyText={HORIZON_WORDS.effectNone}
            shortNote={shortNote}
          />
        )}
        <ModalFooterActions
          note={error ?? (questions.hasReviewed ? blocker : questions.blocker)}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={requestClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          }
          rightActions={
            questions.hasReviewed ? (
              <Button
                type='button'
                loading={isSaving}
                disabled={isSaving || blocker !== null}
                onClick={() => void handleSubmit()}
              >
                {HORIZON_WORDS.add(name)}
              </Button>
            ) : (
              <Button
                type='button'
                disabled={!questions.open?.isAnswered}
                onClick={questions.advance}
              >
                {FORM_FLOW_WORDS.next}
              </Button>
            )
          }
        />
      </div>
      {costDraft !== null && (
        <CostForm
          itemName={name}
          happensOn={date ?? today}
          cost={costDraft === 'new' ? undefined : costDraft}
          onSave={(saved) => {
            set({
              costs: formData.costs.some(({ id }) => id === saved.id)
                ? formData.costs.map((cost) =>
                    cost.id === saved.id ? saved : cost,
                  )
                : [...formData.costs, saved],
            });
            setCostDraft(null);
            requestAnimationFrame(() =>
              addCostRef.current?.scrollIntoView({ block: 'nearest' }),
            );
          }}
          onRemove={
            costDraft === 'new'
              ? undefined
              : () => {
                  set({
                    costs: formData.costs.filter(
                      ({ id }) => id !== costDraft.id,
                    ),
                  });
                  setCostDraft(null);
                }
          }
          onClose={() => setCostDraft(null)}
        />
      )}
    </FormSheet>
  );
}

export default HorizonForm;
