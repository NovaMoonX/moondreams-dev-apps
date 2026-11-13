import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Eye } from 'lucide-react';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import SensitiveValue from '@/components/SensitiveValue';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatList } from '@/utils/formatUtils';
import { generateUuid } from '@/utils/idUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  CONVERT_WORDS,
  FORM_FLOW_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import {
  isReachedAtOnce,
  toEnvelopePayload,
  toGoalPayload,
} from '@apps/runway/engine/convertItem';
import { addUtcMonths } from '@apps/runway/engine/dates';
import { useConvertItemToast } from '@apps/runway/hooks/useConvertItemToast';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { convertItem } from '@apps/runway/store/actions/convertActions';
import { newTransferMoveId } from '@apps/runway/store/actions/transferActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectEnvelopes,
  selectResolvedPlan,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, EnvelopeSealed, GoalSealed } from '@apps/runway/types';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';

export type ConvertSource =
  | { kind: 'envelope'; payload: EnvelopeSealed }
  | { kind: 'goal'; payload: GoalSealed };

interface ConvertItemViewProps {
  itemId: string;
  source: ConvertSource;
  /** What the item holds, as the sheet reads it. */
  heldCents: Cents;
  isPinned: boolean;
  /** Planned changes ahead on the item, which stay with the closed one. */
  plannedCount: number;
  today: number;
  onBack: () => void;
  onClose: () => void;
}

/** The view an envelope's or goal's sheet swaps in to make it the other kind: what is asked (a goal's target), what changes, and the shop rules that will need a new home. */
function ConvertItemView({
  itemId,
  source,
  heldCents,
  isPinned,
  plannedCount,
  today,
  onBack,
  onClose,
}: ConvertItemViewProps) {
  const { user } = useAuth();
  const { isHidden, toggle: showAmounts } = useValuesHidden();
  const mask = useMaskedText();
  const toastConverted = useConvertItemToast();
  const { openView } = useRunwayUrlState();
  const level = useAppSelector(selectLevel);
  const accounts = useAppSelector(selectAccounts);
  const rules = useAppSelector(selectRules);
  const { describe } = useRuleNames();
  const [moveId] = useState(newTransferMoveId);
  const [newItemId] = useState(generateUuid);
  const [amount, setAmount] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const name = source.payload.name;
  const isToGoal = source.kind === 'envelope';
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const maxCents = source.kind === 'envelope' ? source.payload.maxCents : null;
  const amountValue = amount ?? (maxCents ? centsToInputValue(maxCents) : '');
  const parsedTarget = parseMoneyToCents(amountValue);
  const targetCents =
    parsedTarget !== null &&
    parsedTarget > 0 &&
    parsedTarget <= MAX_PURCHASE_CENTS
      ? parsedTarget
      : null;
  const targetDate = date === '' ? null : (fromDateInputValue(date) ?? null);
  const isDateBad = date !== '' && targetDate === null;
  const payLines = useAppSelector((state) => selectResolvedPlan(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const openDays = useAppSelector((state) => state.runway.days);
  const pairingNames = payLines.flatMap(({ payLines: lines }) =>
    lines
      .filter(({ version }) =>
        version.payload.pairings.some((pair) => pair.targetItemId === itemId),
      )
      .map(({ version }) => version.payload.name),
  );
  const spillNames = isToGoal
    ? envelopes
        .filter(({ version }) => version.payload.spillTo.includes(itemId))
        .map(({ version }) => version.payload.name)
    : [];
  const dayOverrideCount = openDays.filter(
    ({ expectedOn, confirmedAt, override }) =>
      expectedOn >= today &&
      confirmedAt === null &&
      (override.pairings?.some((pair) => pair.targetItemId === itemId) ===
        true ||
        itemId in override.holdResolutions ||
        itemId in override.payloads ||
        itemId in override.billCents),
  ).length;
  const heldRules =
    isToGoal && level === 'link'
      ? rules.filter((rule) => rule.target === itemId)
      : [];

  const getBlocker = () => {
    if (isHidden) return CONVERT_WORDS.showToConvert;
    if (heldCents < 0) return CONVERT_WORDS.blockedOver;
    if (!isToGoal) return null;
    if (targetCents === null) return FORM_FLOW_WORDS.badAmount;
    if (isDateBad) return FORM_FLOW_WORDS.pastDay;
    if (targetDate !== null && targetDate > lastDate) {
      return CONVERT_WORDS.farDay(LOOKAHEAD_MONTHS);
    }
    if (targetDate !== null && targetDate < today) {
      return FORM_FLOW_WORDS.pastDay;
    }
    return null;
  };
  const blocker = getBlocker();
  const isReached =
    isToGoal &&
    !isHidden &&
    targetCents !== null &&
    isReachedAtOnce(targetCents, heldCents);

  const carriedParts =
    source.kind === 'envelope'
      ? [
          ...(source.payload.maxCents === null ? [] : [CONVERT_WORDS.limit]),
          ...(source.payload.spillTo.length === 0
            ? []
            : [CONVERT_WORDS.overflow]),
          ...(isPinned ? [CONVERT_WORDS.homePin] : []),
        ]
      : [
          source.payload.targetDate === null
            ? CONVERT_WORDS.targetOnly
            : CONVERT_WORDS.targetAndDate,
        ];
  const lines = [
    heldCents > 0
      ? CONVERT_WORDS.moneyStays(formatCents(heldCents))
      : CONVERT_WORDS.historyStays,
    ...(carriedParts.length === 0
      ? []
      : [CONVERT_WORDS.wontCarry(formatList(carriedParts))]),
    ...(source.kind === 'goal' && source.payload.state === 'paused'
      ? [CONVERT_WORDS.paused]
      : []),
    ...(plannedCount > 0 ? [CONVERT_WORDS.plannedAhead(plannedCount)] : []),
    ...(pairingNames.length === 0
      ? []
      : [CONVERT_WORDS.payWontCarry(formatList(pairingNames))]),
    ...(dayOverrideCount > 0
      ? [CONVERT_WORDS.daysWontCarry(dayOverrideCount)]
      : []),
    ...(spillNames.length === 0
      ? []
      : [CONVERT_WORDS.spillWontCarry(spillNames)]),
  ];

  const convert = async () => {
    if (isSavingRef.current || !user || blocker !== null) return;
    if (!navigator.onLine) {
      setError(CONVERT_WORDS.offline);
      return;
    }
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const base = {
        moveId,
        newItemId,
        itemId,
        name,
        heldCents,
        accountIds: accounts.map((account) => account.id),
      };
      const written = await convertItem(
        user.uid,
        encryption,
        source.kind === 'envelope'
          ? {
              ...base,
              from: 'envelope',
              payload: toGoalPayload(source.payload, {
                targetCents: targetCents ?? 0,
                targetDate,
              }),
            }
          : {
              ...base,
              from: 'goal',
              payload: toEnvelopePayload(source.payload),
            },
      );
      toastConverted(written);
      onClose();
      if (heldRules.length > 0) openView('rules');
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? CONVERT_WORDS.offline
          : getErrorMessage(saveError, CONVERT_WORDS.failed),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const action = isToGoal ? CONVERT_WORDS.toGoal : CONVERT_WORDS.toEnvelope;

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>
        {isToGoal
          ? CONVERT_WORDS.titleToGoal(name)
          : CONVERT_WORDS.titleToEnvelope(name)}
      </ActionTitle>
      {isToGoal && (
        <>
          {isHidden ? (
            <Button
              type='button'
              variant='secondary'
              className='text-foreground! relative h-auto min-h-11 w-full justify-between rounded-2xl px-3! py-2 font-normal'
              onClick={showAmounts}
            >
              <span>{CONVERT_WORDS.showToSet}</span>
              <Eye
                className='text-muted-foreground h-5 w-5'
                aria-hidden='true'
              />
            </Button>
          ) : (
            <AmountHero
              label={CONVERT_WORDS.target}
              value={amountValue}
              onChange={setAmount}
              disabled={isSaving}
            />
          )}
          {amount === null && maxCents ? (
            <p className='text-muted-foreground text-center text-sm'>
              {CONVERT_WORDS.fromLimitBefore}
              <SensitiveValue>{formatCents(maxCents)}</SensitiveValue>
              {CONVERT_WORDS.fromLimitAfter}
            </p>
          ) : null}
          {isReached && (
            <InlineNotice tone='info'>
              {CONVERT_WORDS.reachedAtOnce(name)}
            </InlineNotice>
          )}
          <ActionSection caption={CONVERT_WORDS.byWhen}>
            <div className='space-y-3'>
              <DateInput
                variant='outline'
                aria-label={CONVERT_WORDS.byWhen}
                min={toDateInputValue(today)}
                max={toDateInputValue(lastDate)}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={isSaving}
              />
              {date === '' ? (
                <p className='text-muted-foreground text-sm'>
                  {CONVERT_WORDS.noDateHint}
                </p>
              ) : (
                <div>
                  <RevealChip onClick={() => setDate('')}>
                    {CONVERT_WORDS.noDate}
                  </RevealChip>
                </div>
              )}
            </div>
          </ActionSection>
        </>
      )}
      <ActionSection caption={CONVERT_WORDS.changesHeading}>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {lines.map((line) => (
            <li key={line} className='px-3 py-2 text-sm'>
              <MaskedText>{line}</MaskedText>
            </li>
          ))}
        </ul>
      </ActionSection>
      {heldRules.length > 0 && (
        <ActionSection caption={CONVERT_WORDS.rulesCaption(heldRules.length)}>
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {heldRules.map((rule) => (
              <li key={rule.id} className='px-3 py-2 text-sm break-words'>
                {mask(describe(rule))}
              </li>
            ))}
          </ul>
        </ActionSection>
      )}
      <ModalFooterActions
        note={error ?? blocker}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void convert()}
          >
            {action}
          </Button>
        }
      />
    </div>
  );
}

export default ConvertItemView;
