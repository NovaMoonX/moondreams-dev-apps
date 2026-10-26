import { useEffect, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero, { AmountHeroLink } from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import SearchInput from '@/components/SearchInput';
import SummaryRow from '@/components/SummaryRow';
import { useAuth } from '@/hooks/useAuth';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import SplitEditor from '@apps/runway/components/SplitEditor';
import {
  FORM_FLOW_WORDS,
  MAX_NOTE_LENGTH,
  MAX_PURCHASE_CENTS,
  MAX_NAME_LENGTH,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getCountedFrom,
  getPurchaseEffect,
  getRefundableCents,
  getRefundLines,
  isInTrackingPeriods,
  splitEvenly,
  toChosenLines,
} from '@apps/runway/engine/purchases';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  addPurchase,
  editPurchase,
} from '@apps/runway/store/actions/purchaseActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectEnvelopes,
  selectItemLooks,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase, PurchaseLine } from '@apps/runway/types';
import {
  describeEnvelopes,
  describePurchaseEdit,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';

const ORIGIN_PAGE = 20;
const MOST_USED_SHOWN = 5;
const RECENT_PURCHASES = 60;
const ORIGIN_SEARCH_THRESHOLD = 8;
const FREE_VALUE = 'free';

interface PurchaseFormData {
  amount: string;
  date: string;
  extras: { merchant: string | null; note: string | null };
}

interface PurchaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** The envelope the form opened from; it starts chosen. */
  presetEnvelopeId?: string | null;
  /** The purchase being changed; the form then saves over it instead of adding. */
  editing?: OpenPurchase;
}

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Adds what was spent, or changes a purchase already added: an amount, the envelope it came out of (or several), the day, and a refund when money came back. Needs a connection, since the plan is read fresh as it saves. */
function PurchaseForm({
  isOpen,
  onClose,
  presetEnvelopeId = null,
  editing,
}: PurchaseFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isMounted = useRef(true);
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const balances = useAppSelector(selectBalances);
  const purchases = useAppSelector(selectSpendPurchases);
  const looks = useAppSelector(selectItemLooks);
  const periods = useAppSelector(
    (state) => state.runway.plan?.trackingPeriods ?? [],
  );

  const [initialData] = useState<PurchaseFormData>(() => ({
    amount: editing ? (Math.abs(editing.amountCents) / 100).toFixed(2) : '',
    date: toDateInputValue(editing ? editing.date : todayAsUtcDate()),
    extras: {
      merchant: editing?.merchant ?? null,
      note: editing?.note ?? null,
    },
  }));
  const editingLines = editing?.lines ?? [];
  const startsSplit =
    editing !== undefined && editing.amountCents > 0 && editingLines.length > 1;
  const [formData, setFormData] = useState<PurchaseFormData>(initialData);
  const [view, setView] = useState<'form' | 'split' | 'original' | 'envelopes'>(
    'form',
  );
  const [envelopeSearch, setEnvelopeSearch] = useState('');
  const [isRefund, setIsRefund] = useState(
    editing !== undefined && editing.amountCents < 0,
  );
  const [isSplit, setIsSplit] = useState(startsSplit);
  const [envelopeId, setEnvelopeId] = useState<string | null>(
    editing && !startsSplit && editing.amountCents > 0
      ? (editingLines[0]?.envelopeId ?? null)
      : presetEnvelopeId,
  );
  const [splitIds, setSplitIds] = useState<string[]>(() =>
    startsSplit
      ? editingLines.flatMap((line) =>
          line.envelopeId === null ? [] : [line.envelopeId],
        )
      : [],
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    startsSplit
      ? Object.fromEntries(
          editingLines.flatMap((line) =>
            line.envelopeId === null
              ? []
              : [[line.envelopeId, (line.cents / 100).toFixed(2)]],
          ),
        )
      : {},
  );
  const [originalId, setOriginalId] = useState<string | null>(
    editing?.refundOfId ?? null,
  );
  const [returnTo, setReturnTo] = useState<string>(
    editing && editing.amountCents < 0
      ? (editingLines[0]?.envelopeId ?? FREE_VALUE)
      : FREE_VALUE,
  );
  const [originQuery, setOriginQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const countedFrom = getCountedFrom(periods);
  const isEditingCounted =
    editing !== undefined &&
    countedFrom !== null &&
    editing.date >= countedFrom;
  const ownCents = (id: string) =>
    !isEditingCounted
      ? 0
      : editingLines.reduce(
          (sum, line) => (line.envelopeId === id ? sum + line.cents : sum),
          0,
        );
  const liveOptions = envelopes.map(({ item, version }) => ({
    id: item.id,
    name: version.payload.name,
    emoji: version.payload.emoji,
    leftCents: (balances.assignedByItem[item.id] ?? 0) + ownCents(item.id),
  }));
  const keptOptions = [
    ...new Set(
      editingLines.flatMap((line) =>
        line.envelopeId === null ? [] : [line.envelopeId],
      ),
    ),
  ]
    .filter((id) => !liveOptions.some((option) => option.id === id))
    .map((id) => ({
      id,
      name: looks.get(id)?.name ?? 'An envelope',
      emoji: looks.get(id)?.emoji ?? null,
      leftCents: ownCents(id),
    }));
  const options = [...liveOptions, ...keptOptions];
  const others = purchases.filter((purchase) => purchase.id !== editing?.id);
  const refundedCents = editing
    ? others
        .filter((purchase) => purchase.refundOfId === editing.id)
        .reduce((sum, purchase) => sum - purchase.amountCents, 0)
    : 0;
  const liveIds = new Set(options.map((option) => option.id));
  const leftById = Object.fromEntries(
    options.map((option) => [option.id, option.leftCents]),
  );
  const nameOf = (id: string) => looks.get(id)?.name ?? 'An envelope';

  const parsed = parseMoneyToCents(formData.amount);
  const amount =
    parsed !== null && parsed > 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const date = fromDateInputValue(formData.date) ?? null;
  const original =
    originalId === null
      ? null
      : (others.find((purchase) => purchase.id === originalId) ?? null);
  const refundable =
    original === null ? null : getRefundableCents(original, others);
  const refundedBy = others
    .filter((purchase) => editing && purchase.refundOfId === editing.id)
    .flatMap((purchase) => purchase.lines)
    .reduce<Record<string, number>>((acc, line) => {
      const key = line.envelopeId ?? FREE_VALUE;
      return { ...acc, [key]: (acc[key] ?? 0) - line.cents };
    }, {});
  const centsAt = (set: readonly PurchaseLine[], key: string) =>
    set
      .filter((line) => (line.envelopeId ?? FREE_VALUE) === key)
      .reduce((sum, line) => sum + line.cents, 0);
  const returnsToOriginal =
    isRefund &&
    original !== null &&
    getRefundLines(original.amountCents, original, (id) => liveIds.has(id))
      .kind === 'lines';

  const getLines = (): PurchaseLine[] | null => {
    if (amount === null) return null;
    if (isRefund) {
      const keepsStored =
        editing !== undefined &&
        amount === -editing.amountCents &&
        originalId === editing.refundOfId &&
        (returnsToOriginal ||
          returnTo === (editingLines[0]?.envelopeId ?? FREE_VALUE));
      if (keepsStored) return editingLines;
      if (original !== null && returnsToOriginal) {
        const result = getRefundLines(
          amount,
          original,
          (id) => liveIds.has(id),
          others,
        );
        return result.kind === 'lines' ? result.lines : null;
      }
      const target = returnTo === FREE_VALUE ? null : returnTo;
      if (target !== null && !liveIds.has(target)) return null;
      return toChosenLines([{ envelopeId: target, cents: -amount }]);
    }
    if (isSplit) {
      const parts = splitIds.map((id) => ({
        envelopeId: id,
        cents: parseMoneyToCents(shares[id] ?? ''),
      }));
      const isValid =
        parts.length >= 2 &&
        parts.every((part) => part.cents !== null && part.cents > 0);
      const total = parts.reduce((sum, part) => sum + (part.cents ?? 0), 0);
      if (!isValid || total !== amount) return null;
      return toChosenLines(
        parts.map((part) => ({
          envelopeId: part.envelopeId,
          cents: part.cents ?? 0,
        })),
      );
    }
    if (envelopeId === null || !liveIds.has(envelopeId)) return null;
    return toChosenLines([{ envelopeId, cents: amount }]);
  };
  const lines = getLines();

  const getBlocker = () => {
    if (amount === null) return SPEND_WORDS.needsAmount;
    if (isRefund && refundable !== null && amount > refundable) {
      return refundable === 0
        ? 'That purchase has been refunded in full.'
        : `Only ${formatCents(refundable)} of that purchase can still be refunded.`;
    }
    if (!isRefund && refundedCents > amount) return SPEND_WORDS.belowRefunds;
    if (lines === null) {
      if (isSplit && !isRefund) return SPEND_WORDS.needsShares;
      return SPEND_WORDS.needsEnvelope;
    }
    const shortKey = isRefund
      ? undefined
      : Object.keys(refundedBy).find(
          (key) =>
            centsAt(lines, key) <
            Math.min(refundedBy[key], centsAt(editingLines, key)),
        );
    if (shortKey !== undefined) {
      return `${shortKey === FREE_VALUE ? SPEND_WORDS.freeToSpend : nameOf(shortKey)} already got back more than that from refunds.`;
    }
    if (date === null || date > today) return SPEND_WORDS.needsDay;
    if (!isInTrackingPeriods(periods, date)) {
      return `Tracking was not on for ${formatDateUTC(date)}.`;
    }
    if (countedFrom !== null && date < countedFrom && date !== editing?.date) {
      return `Tracking started again on ${formatDateUTC(countedFrom)}. Pick that day or later.`;
    }
    return null;
  };
  const blocker = getBlocker();

  const isCounted =
    date !== null && countedFrom !== null && date >= countedFrom;
  const effect =
    lines === null || !isCounted ? null : getPurchaseEffect(lines, leftById);
  const getEffectLine = () => {
    if (effect === null || lines === null) return null;
    const freeChange =
      effect.freeDropCents < 0
        ? `Free to spend goes up by ${formatCents(-effect.freeDropCents)}.`
        : `Free to spend drops by ${formatCents(effect.freeDropCents)}.`;
    if (effect.over.length === 1) {
      const [only] = effect.over;
      return `${nameOf(only.envelopeId)} would be ${formatCents(only.overCents)} over. ${freeChange}`;
    }
    if (effect.over.length > 1) {
      return `${effect.over.length} envelopes would be over. ${freeChange}`;
    }
    if (effect.freeDropCents < 0) {
      return `Free to spend goes up by ${formatCents(-effect.freeDropCents)}.`;
    }
    if (lines.length === 1 && lines[0].envelopeId !== null) {
      const left = (leftById[lines[0].envelopeId] ?? 0) - lines[0].cents;
      return `${nameOf(lines[0].envelopeId)} would have ${formatCents(left)} left.`;
    }
    return null;
  };
  const effectLine = getEffectLine();

  const startSplit = () => {
    const first = envelopeId !== null ? [envelopeId] : [];
    setSplitIds(first);
    setShares(
      first.length === 1 && amount !== null
        ? { [first[0]]: formData.amount }
        : {},
    );
    setIsSplit(true);
    setView('split');
  };

  const stopSplit = () => {
    setEnvelopeId(splitIds[0] ?? envelopeId);
    setIsSplit(false);
  };

  const leaveSplit = () => {
    if (splitIds.length < 2) stopSplit();
    setView('form');
  };

  const toggleRefund = () => {
    if (!isRefund)
      setReturnTo((isSplit ? splitIds[0] : envelopeId) ?? FREE_VALUE);
    else if (returnTo !== FREE_VALUE) setEnvelopeId(returnTo);
    setIsRefund((current) => !current);
    setIsSplit(false);
    setOriginalId(null);
  };

  const evenShares = () => {
    if (amount === null) return;
    const ids = [...splitIds].sort();
    const even = splitEvenly(amount, ids);
    setShares(
      Object.fromEntries(
        ids.map((id, index) => [id, (even[index] / 100).toFixed(2)]),
      ),
    );
  };

  const handleSave = async () => {
    if (!user || blocker !== null || lines === null || amount === null) return;
    if (date === null) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const merchant = formData.extras.merchant?.trim() || null;
      const note = formData.extras.note?.trim() || null;
      const input = {
        date,
        amountCents: isRefund ? -amount : amount,
        merchant,
        note,
        lines,
        refundOfId: isRefund ? originalId : null,
      };
      if (editing) {
        const isUnchanged =
          input.date === editing.date &&
          input.amountCents === editing.amountCents &&
          input.merchant === (editing.merchant?.trim() || null) &&
          input.note === (editing.note?.trim() || null) &&
          input.refundOfId === editing.refundOfId &&
          JSON.stringify(input.lines) === JSON.stringify(editing.lines);
        if (!isUnchanged) {
          await editPurchase(
            user.uid,
            encryption,
            editing,
            input,
            describePurchaseEdit(editing, input, nameOf),
          );
          addToast({
            title: isRefund ? 'Refund saved' : 'Purchase saved',
            type: 'success',
          });
        }
        onClose();
        return;
      }
      await addPurchase(user.uid, encryption, input);
      addToast({
        title: isRefund ? 'Refund added' : 'Purchase added',
        description: [
          `${formatCents(amount)} ${isRefund ? 'back to' : 'from'} ${describeEnvelopes(lines, nameOf)}.`,
          effect && effect.over.length > 0 ? 'Free to spend dropped.' : null,
        ]
          .filter(Boolean)
          .join(' '),
        type: 'success',
      });
      onClose();
    } catch (saveError) {
      if (isMounted.current) {
        setError(
          isOfflineFailure(saveError)
            ? SPEND_WORDS.offline
            : getErrorMessage(
                saveError,
                'This did not save. Nothing was changed.',
              ),
        );
        setIsSaving(false);
      }
    }
  };

  const candidates = others.filter(
    (purchase) =>
      purchase.amountCents > 0 &&
      getRefundableCents(purchase, others) > 0 &&
      getPurchaseTitle(purchase, nameOf)
        .toLowerCase()
        .includes(originQuery.trim().toLowerCase()),
  );

  const usage = purchases
    .slice(0, RECENT_PURCHASES)
    .flatMap((purchase) => purchase.lines)
    .reduce<Record<string, number>>(
      (acc, line) =>
        line.envelopeId === null
          ? acc
          : { ...acc, [line.envelopeId]: (acc[line.envelopeId] ?? 0) + 1 },
      {},
    );
  const ranked = liveOptions
    .map((option, index) => ({ option, index }))
    .sort(
      (a, b) =>
        (usage[b.option.id] ?? 0) - (usage[a.option.id] ?? 0) ||
        a.index - b.index,
    )
    .map(({ option }) => option);
  const hasMore = options.length > MOST_USED_SHOWN + 1;
  const shownOptions = hasMore
    ? [
        ...ranked.slice(0, MOST_USED_SHOWN),
        ...options.filter(
          (option) =>
            option.id === envelopeId &&
            !ranked.slice(0, MOST_USED_SHOWN).includes(option),
        ),
      ]
    : options;
  const envelopePills = shownOptions.map((option) => ({
    value: option.id,
    label: option.name,
    emoji: option.emoji ?? undefined,
  }));
  const allPills = options.map((option) => ({
    value: option.id,
    label: option.name,
    emoji: option.emoji ?? undefined,
  }));
  const envelopeQuery = envelopeSearch.trim().toLowerCase();
  const foundOptions = options.filter((option) =>
    option.name.toLowerCase().includes(envelopeQuery),
  );

  const setExtras = (patch: Partial<PurchaseFormData['extras']>) =>
    setFormData((current) => ({
      ...current,
      extras: { ...current.extras, ...patch },
    }));
  const { extras } = formData;

  const effectNote = effectLine && (
    <p className='text-muted-foreground text-sm' role='status'>
      {effectLine}
    </p>
  );
  const getEnvelopeSummary = () => {
    if (lines === null) return '';
    if (isRefund) return `Back to ${describeEnvelopes(lines, nameOf)}`;
    return describeEnvelopes(lines, nameOf);
  };
  const todayValue = toDateInputValue(today);

  const steps: QuestionStep[] = [
    {
      id: 'amount',
      title: isRefund
        ? FORM_FLOW_WORDS.refundAmountTitle
        : FORM_FLOW_WORDS.purchaseAmountTitle,
      summaryLabel: isRefund ? SPEND_WORDS.refundAmount : SPEND_WORDS.amount,
      summaryValue: amount === null ? '' : formatCents(amount),
      isAnswered: amount !== null,
      render: () => (
        <AmountHero
          label={isRefund ? SPEND_WORDS.refundAmount : SPEND_WORDS.amount}
          value={formData.amount}
          onChange={(next) =>
            setFormData((current) => ({ ...current, amount: next }))
          }
          disabled={isSaving}
          links={
            editing ? null : (
              <AmountHeroLink onClick={toggleRefund}>
                {isRefund
                  ? FORM_FLOW_WORDS.notRefundLink
                  : FORM_FLOW_WORDS.refundLink}
              </AmountHeroLink>
            )
          }
        />
      ),
    },
    {
      id: 'envelope',
      title: isRefund
        ? FORM_FLOW_WORDS.refundForTitle
        : FORM_FLOW_WORDS.purchaseForTitle,
      summaryLabel: isRefund ? SPEND_WORDS.returnsTo : SPEND_WORDS.envelope,
      summaryValue: getEnvelopeSummary(),
      isAnswered: lines !== null,
      isPreAnswered:
        !isRefund &&
        presetEnvelopeId !== null &&
        envelopeId === presetEnvelopeId,
      render: () => (
        <div className='space-y-4'>
          {isRefund && (
            <SummaryRow
              label={SPEND_WORDS.refundOf}
              onClick={() => setView('original')}
              detail={
                original !== null && returnsToOriginal && lines
                  ? `Returns to ${describeEnvelopes(lines, nameOf)}.`
                  : undefined
              }
            >
              {original === null
                ? SPEND_WORDS.noOriginal
                : getPurchaseTitle(original, nameOf)}
            </SummaryRow>
          )}
          {isRefund && !returnsToOriginal && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs'>
                {SPEND_WORDS.returnsTo}
              </p>
              <PillGroup
                label={SPEND_WORDS.returnsTo}
                options={[
                  { value: FREE_VALUE, label: SPEND_WORDS.freeToSpend },
                  ...allPills,
                ]}
                value={returnTo}
                onChange={setReturnTo}
              />
            </div>
          )}
          {!isRefund && !isSplit && (
            <div className='space-y-2'>
              <PillGroup
                label={SPEND_WORDS.envelope}
                options={envelopePills}
                value={envelopeId}
                onChange={setEnvelopeId}
              />
              {(hasMore || (amount !== null && options.length >= 2)) && (
                <div className='flex flex-wrap gap-2'>
                  {hasMore && (
                    <RevealChip
                      icon={<Search className='h-4 w-4' />}
                      onClick={() => {
                        setEnvelopeSearch('');
                        setView('envelopes');
                      }}
                    >
                      {FORM_FLOW_WORDS.more}
                    </RevealChip>
                  )}
                  {amount !== null && options.length >= 2 && (
                    <RevealChip
                      icon={<Plus className='h-4 w-4' />}
                      onClick={startSplit}
                    >
                      {SPEND_WORDS.split}
                    </RevealChip>
                  )}
                </div>
              )}
            </div>
          )}
          {!isRefund && isSplit && (
            <div className='space-y-2'>
              <SummaryRow
                label={SPEND_WORDS.splitLabel}
                onClick={() => setView('split')}
              >
                {splitIds.length === 0
                  ? 'Pick the envelopes'
                  : splitIds
                      .map(
                        (id) =>
                          `${nameOf(id)} ${formatCents(parseMoneyToCents(shares[id] ?? '') ?? 0)}`,
                      )
                      .join(', ')}
              </SummaryRow>
              <div>
                <RevealChip
                  icon={<X className='h-4 w-4' />}
                  onClick={stopSplit}
                >
                  {SPEND_WORDS.unsplit}
                </RevealChip>
              </div>
            </div>
          )}
          {effectNote}
        </div>
      ),
    },
    {
      id: 'day',
      title: FORM_FLOW_WORDS.dayTitle,
      summaryLabel: SPEND_WORDS.day,
      summaryValue:
        formData.date === todayValue
          ? 'Today'
          : date === null
            ? ''
            : formatDateUTC(date),
      isAnswered: date !== null && date <= today,
      isPreAnswered: true,
      render: () => (
        <Input
          type='date'
          variant='outline'
          aria-label={SPEND_WORDS.day}
          max={todayValue}
          value={formData.date}
          disabled={isSaving}
          onChange={(event) =>
            setFormData((current) => ({
              ...current,
              date: event.target.value,
            }))
          }
        />
      ),
    },
  ];
  const questions = useQuestionFlow({
    steps,
    startFolded: editing !== undefined,
  });

  const formBody = (
    <div className='space-y-5'>
      <QuestionFlow
        flow={questions}
        nextLabel={editing ? FORM_FLOW_WORDS.done : FORM_FLOW_WORDS.next}
      />
      {questions.isReview && (
        <div className='space-y-3'>
          {effectNote}
          {extras.merchant !== null && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {SPEND_WORDS.where}
              </p>
              <Input
                variant='outline'
                aria-label={SPEND_WORDS.where}
                maxLength={MAX_NAME_LENGTH}
                placeholder={SPEND_WORDS.wherePlaceholder}
                value={extras.merchant}
                disabled={isSaving}
                onChange={(event) =>
                  setExtras({ merchant: event.target.value })
                }
              />
            </div>
          )}
          {extras.note !== null && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {SPEND_WORDS.note}
              </p>
              <Input
                variant='outline'
                aria-label={SPEND_WORDS.note}
                maxLength={MAX_NOTE_LENGTH}
                placeholder={SPEND_WORDS.notePlaceholder}
                value={extras.note}
                disabled={isSaving}
                onChange={(event) => setExtras({ note: event.target.value })}
              />
            </div>
          )}
          <div className='flex flex-wrap gap-2'>
            <RevealChip
              icon={
                extras.merchant === null ? (
                  <Plus className='h-4 w-4' />
                ) : (
                  <X className='h-4 w-4' />
                )
              }
              onClick={() =>
                setExtras({ merchant: extras.merchant === null ? '' : null })
              }
            >
              {extras.merchant === null
                ? SPEND_WORDS.addWhere
                : SPEND_WORDS.removeWhere}
            </RevealChip>
            <RevealChip
              icon={
                extras.note === null ? (
                  <Plus className='h-4 w-4' />
                ) : (
                  <X className='h-4 w-4' />
                )
              }
              onClick={() =>
                setExtras({ note: extras.note === null ? '' : null })
              }
            >
              {extras.note === null
                ? SPEND_WORDS.addNote
                : SPEND_WORDS.removeNote}
            </RevealChip>
          </div>
        </div>
      )}
      <ModalFooterActions
        note={error ?? (questions.isReview ? blocker : null)}
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
            type='button'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void handleSave()}
          >
            {editing ? SPEND_WORDS.save : SPEND_WORDS.add}
          </Button>
        }
      />
    </div>
  );

  const getSplitBlocker = () => {
    if (splitIds.length < 2) return SPEND_WORDS.needsTwo;
    const placed = splitIds.reduce(
      (sum, id) => sum + (parseMoneyToCents(shares[id] ?? '') ?? 0),
      0,
    );
    return amount !== null && placed !== amount
      ? SPEND_WORDS.needsShares
      : null;
  };
  const splitBlocker = getSplitBlocker();

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={SPEND_WORDS.sheetTitle}>
      {view === 'split' && amount !== null && (
        <div className='space-y-3'>
          <SplitEditor
            totalCents={amount}
            envelopes={options}
            ids={splitIds}
            shares={shares}
            onIdsChange={(ids) => {
              setSplitIds(ids);
              setShares((current) =>
                Object.fromEntries(ids.map((id) => [id, current[id] ?? ''])),
              );
            }}
            onShareChange={(id, text) =>
              setShares((current) => ({ ...current, [id]: text }))
            }
            onEvenly={evenShares}
            onBack={leaveSplit}
            isSaving={isSaving}
          />
          <ModalFooterActions
            note={splitBlocker}
            rightActions={
              <Button
                type='button'
                disabled={splitBlocker !== null}
                onClick={() => setView('form')}
              >
                {SPEND_WORDS.splitDone}
              </Button>
            }
          />
        </div>
      )}
      {view === 'original' && (
        <div className='space-y-3'>
          <BackLink onBack={() => setView('form')} />
          <p className='text-muted-foreground text-sm'>
            {SPEND_WORDS.pickOriginal}
          </p>
          <Button
            type='button'
            variant='secondary'
            className='h-10 w-full justify-start'
            onClick={() => {
              setOriginalId(null);
              setView('form');
            }}
          >
            {SPEND_WORDS.noOriginal}
          </Button>
          {others.length >= ORIGIN_SEARCH_THRESHOLD && (
            <SearchInput
              value={originQuery}
              onChange={setOriginQuery}
              placeholder={SPEND_WORDS.search}
            />
          )}
          {candidates.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {SPEND_WORDS.noMatch}
            </p>
          )}
          <ul className='border-border divide-border divide-y rounded-2xl border'>
            {candidates.slice(0, ORIGIN_PAGE).map((purchase) => (
              <li key={purchase.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='text-foreground! h-auto w-full items-start justify-between gap-3 px-3! py-3 text-left font-normal whitespace-normal'
                  onClick={() => {
                    setOriginalId(purchase.id);
                    setView('form');
                  }}
                >
                  <span className='min-w-0'>
                    <span className='line-clamp-2 font-medium break-words'>
                      {getPurchaseTitle(purchase, nameOf)}
                    </span>
                    <span className='text-muted-foreground block text-sm'>
                      {formatDateUTC(purchase.date)}
                    </span>
                  </span>
                  <span className='shrink-0 font-semibold whitespace-nowrap tabular-nums'>
                    {formatCents(purchase.amountCents)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view === 'envelopes' && (
        <div className='space-y-3'>
          <BackLink onBack={() => setView('form')} />
          <p className='text-lg font-semibold'>{FORM_FLOW_WORDS.moreTitle}</p>
          {options.length >= ORIGIN_SEARCH_THRESHOLD && (
            <SearchInput
              value={envelopeSearch}
              onChange={setEnvelopeSearch}
              placeholder={FORM_FLOW_WORDS.findEnvelope}
            />
          )}
          {foundOptions.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {FORM_FLOW_WORDS.noEnvelopeMatch}
            </p>
          )}
          <ul className='border-border divide-border max-h-[max(9rem,calc(92dvh-22rem))] divide-y overflow-y-auto rounded-2xl border [@media(max-height:499px)]:max-h-none'>
            {foundOptions.map((option) => (
              <li key={option.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  aria-pressed={option.id === envelopeId}
                  className='text-foreground! h-auto min-h-12 w-full items-center justify-between gap-3 px-3! py-2 text-left font-normal whitespace-normal'
                  onClick={() => {
                    setEnvelopeId(option.id);
                    setView('form');
                  }}
                >
                  <span className='flex w-full min-w-0 items-center gap-3'>
                    <ItemBadge name={option.name} emoji={option.emoji} />
                    <span className='line-clamp-2 min-w-0 flex-1 text-left font-medium break-words'>
                      {option.name}
                    </span>
                    <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap tabular-nums'>
                      {formatCents(option.leftCents)}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={join(view !== 'form' && 'hidden')}>{formBody}</div>
    </FormSheet>
  );
}

export default PurchaseForm;
