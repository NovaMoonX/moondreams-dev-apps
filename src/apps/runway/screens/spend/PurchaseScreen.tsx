import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import {
  HandCoins,
  ImagePlus,
  Layers,
  Pencil,
  ReceiptText,
  Repeat,
  Trash2,
  Undo2,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import CameraTile from '@/components/forms/CameraTile';
import ExternalLinkText from '@/components/ExternalLinkText';
import FormSheet from '@/components/FormSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { maskForMode } from '@apps/runway/utils/maskText';
import {
  isReceiptTotalRow,
  splitReceiptRow,
} from '@apps/runway/utils/receiptText';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { getWebLinkHost } from '@/utils/urlUtils';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { useUnmatchCharge } from '@apps/runway/hooks/useAutoPay';
import {
  AUTO_PAY_WORDS,
  HORIZON_END_WORDS,
  MAX_RECEIPTS_PER_PURCHASE,
  NEEDS_HOME_WORDS,
  PAIR_WORDS,
  PURCHASE_COST_WORDS,
  RECEIPT_TEXT_LINES_SHOWN,
  RECEIPT_TEXT_MIN_HIDDEN,
  RULE_WORDS,
  SPEND_WORDS,
  SPILL_WORDS,
} from '@apps/runway/constants';
import { keepEntryFor } from '@/hooks/useBackHistory';
import type { OpenPurchase, PurchaseLine } from '@apps/runway/types';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import RuleSheet from '@apps/runway/forms/RuleSheet';
import {
  findPlacementRun,
  isHeldByOffer,
  toMerchantKey,
  wouldRulePlace,
} from '@apps/runway/engine/rules';
import { declineRule, isRuleDeclined } from '@apps/runway/utils/ruleDeclined';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import ExpenseView from '@apps/runway/components/ExpenseView';
import ReceiptFileInput, {
  type ReceiptChooser,
} from '@apps/runway/components/ReceiptFileInput';
import LeaveOutRow from '@apps/runway/components/LeaveOutRow';
import NeedsHomeAssign from '@apps/runway/components/NeedsHomeAssign';
import PairOffer from '@apps/runway/components/PairOffer';
import SameAsOffer from '@apps/runway/components/SameAsOffer';
import ReceiptsBlock from '@apps/runway/components/ReceiptsBlock';
import ReceiptViewer from '@apps/runway/components/ReceiptViewer';
import { forgetReceiptImage } from '@apps/runway/hooks/useReceiptImageUrl';
import { useReceiptImages } from '@apps/runway/hooks/useReceiptImages';
import {
  findScrollParent,
  pickReceiptFiles,
} from '@apps/runway/utils/receiptFiles';
import {
  addReceiptImages,
  removeReceiptImagesOf,
} from '@apps/runway/store/actions/receiptActions';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import SheetHead from '@apps/runway/components/SheetHead';
import { useExpensePurchases } from '@apps/runway/hooks/useExpensePurchases';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { deletePurchase } from '@apps/runway/store/actions/purchaseActions';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectCostPaid,
  selectExpenses,
  selectAllHorizonItems,
  selectStance,
  selectHistoryDuplicates,
  selectIsMovesLoaded,
  selectItemLooks,
  selectSpendPurchases,
  selectLostPairs,
  selectEnvelopes,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  describeEnvelopes,
  describePurchaseRemoval,
  getPurchaseFacts,
  getPurchaseTitle,
  isRefund,
} from '@apps/runway/utils/purchaseText';

/** What taking a purchase out does to the envelopes it came from; two or more get it back between them. */
const getRemovalEffect = (
  count: number,
  where: string,
  amount: string,
  refund: boolean,
) => {
  if (refund) {
    return count === 1
      ? `${where} will have ${amount} less back.`
      : `${where} will have ${amount} less back between them.`;
  }
  return count === 1
    ? `${where} gets ${amount} back.`
    : `${where} get ${amount} back between them.`;
};

interface PurchaseScreenProps {
  purchaseId: string;
  /** Opens a related purchase; the Spend list uses the address. */
  onOpen?: (purchaseId: string) => void;
  onClose: () => void;
  /** The purchase as a wider read found it, for one dated outside the loaded window. */
  fallback?: OpenPurchase | null;
  /** False when it was opened from its own group, which is already under it. */
  hasGroupLink?: boolean;
  /** Needs a home keeps the sheet open on a purchase just sent for the third time in a row, to offer a rule; it hands over the purchase as sent. */
  onSuggestRule?: (placed: OpenPurchase) => void;
}

/** One purchase: what it was, where it came from, and the ways to change or remove it. */
function PurchaseScreen({
  purchaseId,
  onOpen,
  onClose,
  fallback = null,
  hasGroupLink = true,
  onSuggestRule,
}: PurchaseScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { isHidden } = useValuesHidden();
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const mask = (text: string) => maskForMode(text, isHidden);
  const { openPurchase: openPurchaseInUrl } = useRunwayUrlState();
  const openPurchase = onOpen ?? openPurchaseInUrl;
  const { addToast } = useToast();
  const unmatch = useUnmatchCharge();
  const purchases = useAppSelector(selectSpendPurchases);
  const lostPairs = useAppSelector(selectLostPairs);
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const looks = useAppSelector(selectItemLooks);
  const cards = useAppSelector((state) => state.runway.cards);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const expenses = useAppSelector(selectExpenses);
  const costMarks = useAppSelector(selectCostPaid);
  const horizons = useAppSelector((state) =>
    selectAllHorizonItems(state, todayAsUtcDate()),
  );
  const stance = useAppSelector(selectStance);
  const level = useAppSelector(selectLevel);
  const rules = useAppSelector(selectRules);
  const liveEnvelopes = useAppSelector((state) =>
    selectEnvelopes(state, todayAsUtcDate()),
  );
  const recentPurchases = useAppSelector((state) => state.runway.purchases);
  const waitingPurchases = useAppSelector((state) => state.runway.needsHome);
  const { describe: describeRuleSentence } = useRuleNames();
  const [ruleStep, setRuleStep] = useState<{
    view: 'make' | 'suggest' | 'edit';
    ruleId: string | null;
    wasWaiting: boolean;
  } | null>(null);
  const [isCostOpen, setIsCostOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    key: number;
    purchase: OpenPurchase;
  } | null>(null);
  const [groupViewFor, setGroupViewFor] = useState<string | null>(null);
  const receiptChooser = useRef<ReceiptChooser>(null);
  const canTakePhoto = useCanTakePhoto();
  const [receiptViewId, setReceiptViewId] = useState<string | null>(null);
  const sheetBody = useRef<HTMLDivElement>(null);
  const scrollBeforeReceipt = useRef<number | null>(null);
  const [isAddingReceipt, setIsAddingReceipt] = useState(false);
  const [openedFromGroup, setOpenedFromGroup] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openReceipt = (imageId: string) => {
    scrollBeforeReceipt.current =
      findScrollParent(sheetBody.current)?.scrollTop ?? 0;
    setReceiptViewId(imageId);
  };

  useLayoutEffect(() => {
    const saved = scrollBeforeReceipt.current;
    if (receiptViewId !== null || saved === null) return;
    const restore = (triesLeft: number) => {
      const scroller = findScrollParent(sheetBody.current);
      if (scroller) {
        scroller.scrollTop = saved;
        scrollBeforeReceipt.current = null;
      } else if (triesLeft > 0) {
        requestAnimationFrame(() => restore(triesLeft - 1));
      }
    };
    restore(10);
  }, [receiptViewId]);

  const lostPair = lostPairs.find((entry) => entry.id === purchaseId) ?? null;
  const purchase =
    purchases.find((entry) => entry.id === purchaseId) ??
    lostPair ??
    (fallback?.id === purchaseId ? fallback : null);
  const isWaiting = (purchase?.needsHome ?? false) || lostPair !== null;
  const isMaybeTwice = useAppSelector((state) =>
    selectHistoryDuplicates(state).offers.has(purchaseId),
  );
  const group =
    expenses.find((entry) => entry.id === purchase?.expenseId) ?? null;
  const groupRead = useExpensePurchases(group?.id ?? null);
  const groupPurchases = groupRead.purchases;
  const receiptsResult = useReceiptImages(purchaseId);
  const receipts =
    receiptsResult.status === 'loaded' ? receiptsResult.images : [];
  const isReceiptsLoaded = receiptsResult.status === 'loaded';
  const isCameraFirst =
    canTakePhoto && receiptsResult.status !== 'failed' && receipts.length === 0;
  const viewedReceipt =
    receipts.find((entry) => entry.id === receiptViewId) ?? null;
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const getLineName = (line: PurchaseLine) =>
    line.envelopeId === null
      ? SPEND_WORDS.freeToSpend
      : nameOf(line.envelopeId);
  const lineGroups = (purchase?.lines ?? []).reduce<
    { line: PurchaseLine; spills: PurchaseLine[] }[]
  >(
    (acc, line) =>
      line.via === 'spill' && acc.length > 0
        ? [
            ...acc.slice(0, -1),
            {
              ...acc[acc.length - 1],
              spills: [...acc[acc.length - 1].spills, line],
            },
          ]
        : [...acc, { line, spills: [] }],
    [],
  );
  const sourceName = purchase
    ? (cards.find((card) => card.id === purchase.paidByCardId)?.name ??
      accounts.find((account) => account.id === purchase.accountId)?.name ??
      NEEDS_HOME_WORDS.fromBank)
    : '';

  if (purchase === null) {
    return (
      <FormSheet isOpen onClose={onClose} title={SPEND_WORDS.detailTitle}>
        <p className='text-muted-foreground pb-4 text-sm'>
          {isLoaded ? SPEND_WORDS.notFound : 'Getting your plan.'}
        </p>
      </FormSheet>
    );
  }

  const refund = isRefund(purchase);
  const placedRule =
    purchase.ruleId === null
      ? null
      : (rules.find((entry) => entry.id === purchase.ruleId) ?? null);
  const run =
    level === 'link' && !isWaiting && purchase.source === 'link'
      ? findPlacementRun(
          toMerchantKey(purchase.merchant),
          recentPurchases,
          rules,
        )
      : null;
  const merchantKey = toMerchantKey(purchase.merchant);
  const suggestion =
    run !== null &&
    run.purchaseIds.includes(purchase.id) &&
    !(user && merchantKey !== null && isRuleDeclined(user.uid, merchantKey))
      ? run
      : null;
  const canMakeRule =
    isWaiting &&
    level === 'link' &&
    lostPair === null &&
    purchase.source === 'link' &&
    purchase.amountCents > 0;
  const merchantRule =
    canMakeRule && merchantKey !== null
      ? (rules.find((entry) => entry.merchantKey === merchantKey) ?? null)
      : null;
  const heldRule =
    canMakeRule && isHeldByOffer(purchase.id, waitingPurchases, recentPurchases)
      ? wouldRulePlace(
          purchase,
          rules,
          new Set(liveEnvelopes.map(({ item }) => item.id)),
          new Set(),
        )
      : null;
  const stepRule =
    ruleStep?.view === 'edit'
      ? (rules.find((entry) => entry.id === ruleStep.ruleId) ?? null)
      : null;
  const openRuleStep = (
    view: 'make' | 'suggest' | 'edit',
    ruleId: string | null,
  ) => setRuleStep({ view, ruleId, wasWaiting: isWaiting });
  const title = getPurchaseTitle(purchase, nameOf, isHidden);
  const amount = formatCents(Math.abs(purchase.amountCents));
  const original = purchase.refundOfId
    ? (purchases.find((entry) => entry.id === purchase.refundOfId) ?? null)
    : null;
  const refunds = purchases.filter((entry) => entry.refundOfId === purchase.id);
  const refundedCents = refunds.reduce(
    (sum, entry) => sum - entry.amountCents,
    0,
  );
  const envelopes = describeEnvelopes(purchase.lines, nameOf);
  const facts = getPurchaseFacts(purchase, envelopes, isHidden);
  const billRef = purchase.billRef ?? null;
  const billName =
    billRef === null
      ? ''
      : (looks.get(billRef.billId)?.name ?? AUTO_PAY_WORDS.fallbackBillName);
  const fact = [
    formatDateOrdinalUTC(purchase.date),
    ...(purchase.status === 'pending' ? [NEEDS_HOME_WORDS.pending] : []),
    ...(billRef !== null
      ? [
          AUTO_PAY_WORDS.paidBill(
            mask(billName),
            formatDateOrdinalUTC(billRef.dueOn),
          ),
        ]
      : isWaiting
        ? [sourceName]
        : facts.length > 0
          ? facts
          : [refund && !isHidden ? `refund to ${envelopes}` : envelopes]),
  ].join(' · ');
  const note = purchase.note?.trim() || null;
  const bankName =
    purchase.bankName?.trim() &&
    purchase.bankName.trim() !== title &&
    purchase.bankName.trim() !== purchase.merchant?.trim()
      ? purchase.bankName.trim()
      : null;
  const receiptText = purchase.receiptText?.trim() || null;
  const receiptRows = receiptText?.split('\n') ?? [];
  const totalRow = isReceiptTotalRow(receiptRows.at(-1) ?? '')
    ? receiptRows.slice(-1)
    : [];
  const bodyRows = receiptRows.slice(0, receiptRows.length - totalRow.length);
  const hasMoreItems =
    bodyRows.length - RECEIPT_TEXT_LINES_SHOWN >= RECEIPT_TEXT_MIN_HIDDEN;
  const shownRows =
    isItemsOpen || !hasMoreItems
      ? receiptRows
      : [...bodyRows.slice(0, RECEIPT_TEXT_LINES_SHOWN), ...totalRow];
  const link = purchase.link?.trim() || null;
  const linkHost = link === null ? null : getWebLinkHost(link);

  const getCostMark = () => {
    const ref = purchase.costRef ?? null;
    if (ref === null) return null;
    const paid =
      (costMarks[ref.itemId] ?? []).find(
        (entry) => entry.purchaseId === purchase.id,
      ) ?? null;
    const version =
      horizons.find(({ item }) => item.id === ref.itemId)?.version ?? null;
    const payload = version?.payload ?? null;
    return {
      paid: paid === null ? null : { ...paid, itemId: ref.itemId },
      finished:
        version && payload && payload.state !== 'open'
          ? { horizon: payload, versionId: version.id }
          : null,
      names: {
        item: nameOf(ref.itemId),
        cost:
          horizons
            .find(({ item }) => item.id === ref.itemId)
            ?.version.payload.costs.find(({ id }) => id === ref.costId)?.name ??
          '',
      },
    };
  };

  const paysRef = purchase.costRef ?? null;
  const paysHorizon =
    paysRef === null
      ? null
      : (horizons.find(({ item }) => item.id === paysRef.itemId)?.version
          .payload ?? null);
  const paysCostName =
    paysHorizon?.costs.find(({ id }) => id === paysRef?.costId)?.name ?? null;

  const unmatchCharge = async () => {
    if (isBusy) return;
    setIsBusy(true);
    const isDone = await unmatch(purchase, billName);
    setIsBusy(false);
    if (isDone) onClose();
  };

  const remove = async () => {
    if (!user || isBusy) return;
    const costMark = getCostMark();
    const blocked = costMark?.finished?.horizon.state === 'calledOff';
    if (blocked && costMark?.finished) {
      addToast({
        title: HORIZON_END_WORDS.calledOffRemovePurchase(
          costMark.finished.horizon.name,
        ),
        type: 'error',
      });
      return;
    }
    const names = [
      ...new Set(
        purchase.lines.map((line) =>
          line.envelopeId === null
            ? SPEND_WORDS.freeToSpend
            : nameOf(line.envelopeId),
        ),
      ),
    ];
    const where = names.join(', ').replace(/, ([^,]*)$/, ' and $1');
    const isConfirmed = await confirm({
      title: SPEND_WORDS.removeTitle,
      message: mask(
        [
          `${title}, ${amount} on ${formatDateOrdinalUTC(purchase.date)}.`,
          getRemovalEffect(names.length, where, amount, refund),
          refunds.length > 0
            ? `Its ${refunds.length === 1 ? 'refund stays' : `${refunds.length} refunds stay`}, and still return${refunds.length === 1 ? 's' : ''} money.`
            : null,
          receipts.length > 0
            ? SPEND_WORDS.receiptsRemovedWithPurchase(receipts.length)
            : null,
          costMark === null
            ? null
            : PURCHASE_COST_WORDS.removeAlsoUnpays(
                costMark.names.cost,
                costMark.names.item,
              ),
          costMark?.finished?.horizon.state === 'finished'
            ? HORIZON_END_WORDS.opensAgain(costMark.finished.horizon.name)
            : null,
          'It stays in the change log.',
        ]
          .filter(Boolean)
          .join(' '),
      ),
      confirmText: SPEND_WORDS.removeConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await deletePurchase(
        user.uid,
        encryption,
        purchase,
        describePurchaseRemoval(purchase, nameOf),
        costMark,
      );
      const hasLeftovers = await removeReceiptImagesOf(
        user.uid,
        purchase.id,
      ).then(
        () => false,
        (cleanupError) => {
          console.error(
            'A removed purchase left receipts behind',
            cleanupError,
          );
          return true;
        },
      );
      receipts.forEach((entry) => forgetReceiptImage(entry.id));
      addToast(
        hasLeftovers
          ? { title: SPEND_WORDS.receiptsLeftWithPurchase, type: 'warning' }
          : { title: 'Purchase removed', type: 'success' },
      );
      onClose();
    } catch (removeError) {
      setError(
        getErrorMessage(
          removeError,
          'This did not remove. Nothing was changed.',
        ),
      );
      setIsBusy(false);
    }
  };

  const addReceipts = async (files: File[]) => {
    if (!user || isAddingReceipt || !isReceiptsLoaded) return;
    if (!navigator.onLine) {
      addToast({ title: SPEND_WORDS.receiptOffline, type: 'error' });
      return;
    }
    const picked = pickReceiptFiles(files, receipts.length);
    if (picked.files.length === 0) {
      if (picked.note) addToast({ title: picked.note, type: 'error' });
      return;
    }
    setIsAddingReceipt(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const failed = await addReceiptImages(
        user.uid,
        encryption,
        purchase.id,
        picked.files,
      );
      addToast(
        failed === 0
          ? {
              title:
                picked.note ?? SPEND_WORDS.receiptAdded(picked.files.length),
              type: 'success',
            }
          : { title: SPEND_WORDS.receiptAddFailed, type: 'error' },
      );
    } catch (addError) {
      addToast({
        title: getErrorMessage(addError, SPEND_WORDS.receiptAddFailed),
        type: 'error',
      });
    }
    setIsAddingReceipt(false);
  };

  if (viewedReceipt !== null) {
    return (
      <FormSheet
        isOpen
        isDrawerWhenShort
        onClose={onClose}
        title={SPEND_WORDS.receipt}
        actions={<ValuesEyeButton />}
      >
        <div className='pb-4'>
          <ReceiptViewer
            image={viewedReceipt}
            onBack={() => setReceiptViewId(null)}
          />
        </div>
      </FormSheet>
    );
  }

  if (group !== null && groupViewFor === purchase.id && openedFromGroup) {
    return (
      <PurchaseScreen
        key={openedFromGroup}
        purchaseId={openedFromGroup}
        fallback={
          groupPurchases?.find((entry) => entry.id === openedFromGroup) ?? null
        }
        onOpen={setOpenedFromGroup}
        onClose={() => setOpenedFromGroup(null)}
        hasGroupLink={false}
      />
    );
  }

  if (group !== null && groupViewFor === purchase.id) {
    return (
      <FormSheet
        isOpen
        isDrawerWhenShort
        onClose={onClose}
        title={mask(group.name)}
        actions={<ValuesEyeButton />}
      >
        <div className='pb-4'>
          <ExpenseView
            expenseId={group.id}
            purchases={groupPurchases}
            isFailed={groupRead.isFailed}
            onBack={() => setGroupViewFor(null)}
            onOpenPurchase={(id) => {
              if (id !== purchase.id) setOpenedFromGroup(id);
              else setGroupViewFor(null);
            }}
          />
        </div>
      </FormSheet>
    );
  }

  if (ruleStep !== null && (ruleStep.view !== 'edit' || stepRule !== null)) {
    return (
      <RuleSheet
        key={ruleStep.view}
        purchase={ruleStep.view === 'edit' ? null : purchase}
        rule={stepRule}
        stayName={ruleStep.wasWaiting ? null : envelopes}
        onBack={() => setRuleStep(null)}
        onClose={() => setRuleStep(null)}
        onDecline={
          ruleStep.view === 'suggest' && user && merchantKey !== null
            ? () => {
                declineRule(user.uid, merchantKey);
                setRuleStep(null);
              }
            : undefined
        }
      />
    );
  }

  if (editTarget !== null) {
    return (
      <PurchaseForm
        key={editTarget.key}
        isOpen
        editing={editTarget.purchase}
        heldReceiptCount={receipts.length}
        onClose={() => setEditTarget(null)}
        onCancel={() => setEditTarget(null)}
      />
    );
  }

  return (
    <>
      {isCostOpen && paysRef !== null && paysHorizon !== null && (
        <HorizonSheet
          itemId={paysRef.itemId}
          horizon={paysHorizon}
          today={todayAsUtcDate()}
          stance={stance}
          openCostId={paysRef.costId}
          returnLabel={title}
          onClose={() => setIsCostOpen(false)}
        />
      )}
      <FormSheet
        isOpen
        isDrawerWhenShort
        onClose={onClose}
        title={title}
        actions={<ValuesEyeButton />}
      >
        <div ref={sheetBody} className='space-y-4 pb-4'>
          <SheetHead
            label={SPEND_WORDS.detailTitle}
            figure={refund ? `+${amount}` : amount}
            fact={fact}
            secondFact={
              bankName === null ? null : SPEND_WORDS.bankName(bankName)
            }
          />
          {(note !== null ||
            receiptText !== null ||
            linkHost !== null ||
            purchase.lines.length > 1) && (
            <dl className='border-border bg-card divide-border divide-y rounded-2xl border text-sm'>
              {note !== null && (
                <div className='space-y-0.5 p-3 break-words'>
                  <dt className='text-muted-foreground text-xs'>
                    {SPEND_WORDS.note}
                  </dt>
                  <dd className='whitespace-pre-line'>{note}</dd>
                </div>
              )}
              {receiptText !== null && (
                <div className='space-y-0.5 p-3 break-words'>
                  <dt className='text-muted-foreground text-xs'>
                    {SPEND_WORDS.items}
                  </dt>
                  <dd className='space-y-1'>
                    {shownRows.map((row, index) => {
                      const { name, price } = splitReceiptRow(row);
                      return (
                        <div
                          key={`${index}-${row}`}
                          className='flex items-start justify-between gap-3'
                        >
                          <span className='min-w-0 break-words'>{name}</span>
                          {price !== null && (
                            <span className='shrink-0 whitespace-nowrap tabular-nums'>
                              {mask(price)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </dd>
                  {hasMoreItems && (
                    <ShowMoreButton
                      isOpen={isItemsOpen}
                      onClick={() => setIsItemsOpen((current) => !current)}
                    >
                      {isItemsOpen
                        ? SPEND_WORDS.showFewerItems
                        : SPEND_WORDS.showAllItems}
                    </ShowMoreButton>
                  )}
                </div>
              )}
              {link !== null && linkHost !== null && (
                <div className='flex items-start justify-between gap-3 p-3'>
                  <dt className='text-muted-foreground'>{SPEND_WORDS.link}</dt>
                  <dd className='min-w-0'>
                    <ExternalLinkText href={link} label={linkHost} />
                  </dd>
                </div>
              )}
              {purchase.lines.length > 1 &&
                lineGroups.map(({ line, spills }, index) => (
                  <Fragment key={`${line.envelopeId ?? 'free'}-${index}`}>
                    {line.cents !== 0 && (
                      <div className='flex items-start justify-between gap-3 p-3'>
                        <dt className='text-muted-foreground min-w-0 break-words'>
                          {getLineName(line)}
                        </dt>
                        <dd className='font-medium whitespace-nowrap tabular-nums'>
                          {mask(formatCents(Math.abs(line.cents)))}
                        </dd>
                      </div>
                    )}
                    {spills.length > 0 && (
                      <div className='p-3'>
                        <dt className='text-muted-foreground text-xs'>
                          {isHidden
                            ? SPILL_WORDS.sheetCaptionHidden
                            : SPILL_WORDS.sheetCaption(getLineName(line))}
                        </dt>
                        <dd>
                          <ul className='mt-2 space-y-2'>
                            {spills.map((spill, at) => (
                              <li
                                key={`${spill.envelopeId ?? 'free'}-${at}`}
                                className='flex items-start justify-between gap-3'
                              >
                                <span className='min-w-0 break-words'>
                                  {getLineName(spill)}
                                </span>
                                <span className='font-medium whitespace-nowrap tabular-nums'>
                                  {mask(formatCents(Math.abs(spill.cents)))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                  </Fragment>
                ))}
            </dl>
          )}
          {receiptsResult.status === 'failed' && (
            <p className='text-muted-foreground text-sm'>
              {SPEND_WORDS.receiptsLoadFailed}
            </p>
          )}
          {receipts.length > 0 && (
            <ReceiptsBlock
              images={receipts}
              onOpen={openReceipt}
              onTakePhoto={
                canTakePhoto && receipts.length < MAX_RECEIPTS_PER_PURCHASE
                  ? () => receiptChooser.current?.open({ isCamera: true })
                  : undefined
              }
              isAddDisabled={!isReceiptsLoaded || isAddingReceipt}
            />
          )}
          {isCameraFirst && (
            <div className='space-y-2'>
              <CameraTile
                title={SPEND_WORDS.takeReceiptPhoto}
                isDisabled={!isReceiptsLoaded || isAddingReceipt}
                onClick={() => receiptChooser.current?.open({ isCamera: true })}
              />
              <Button
                type='button'
                variant='tertiary'
                className='border-border h-11 w-full gap-2 border whitespace-nowrap'
                disabled={!isReceiptsLoaded || isAddingReceipt}
                onClick={() => receiptChooser.current?.open()}
              >
                <ImagePlus className='h-4 w-4 shrink-0' aria-hidden='true' />
                {isAddingReceipt
                  ? SPEND_WORDS.receiptAdding
                  : SPEND_WORDS.readReceiptChoose}
              </Button>
            </div>
          )}
          {lostPair !== null && (
            <p className='text-muted-foreground text-sm'>{PAIR_WORDS.lost}</p>
          )}
          {(isWaiting || isMaybeTwice) && purchase.amountCents > 0 && (
            <SameAsOffer purchase={purchase} onDone={onClose} />
          )}
          {isWaiting && purchase.amountCents > 0 && (
            <PairOffer
              purchase={purchase}
              onDone={onClose}
              elseSubtitle={PAIR_WORDS.pickEnvelope}
            >
              <NeedsHomeAssign
                purchase={purchase}
                onDone={onClose}
                onSuggestRule={onSuggestRule}
              />
            </PairOffer>
          )}
          <ActionGroup isRoomy>
            {billRef === null ? (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Pencil />}
                label={
                  isWaiting ? NEEDS_HOME_WORDS.moreOptions : SPEND_WORDS.edit
                }
                subtitle={
                  isWaiting ? NEEDS_HOME_WORDS.moreOptionsSub : undefined
                }
                isDisabled={isBusy}
                onClick={() => {
                  keepEntryFor('purchase');
                  setEditTarget((current) => ({
                    key: (current?.key ?? 0) + 1,
                    purchase,
                  }));
                }}
              />
            ) : (
              <ActionRow
                isGrouped
                isRoomy
                icon={<Undo2 />}
                label={AUTO_PAY_WORDS.notThisCharge}
                subtitle={AUTO_PAY_WORDS.notThisChargeSub}
                isDisabled={isBusy}
                onClick={() => void unmatchCharge()}
              />
            )}
            {heldRule !== null && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Repeat />}
                label={RULE_WORDS.yourRule}
                subtitle={RULE_WORDS.heldSub}
                onClick={() => openRuleStep('edit', heldRule.id)}
              />
            )}
            {canMakeRule &&
              (merchantRule === null
                ? heldRule === null
                : merchantRule.id !== heldRule?.id) && (
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={<Repeat />}
                  label={
                    merchantRule === null
                      ? RULE_WORDS.alwaysDo
                      : RULE_WORDS.yourRule
                  }
                  subtitle={
                    merchantRule === null
                      ? RULE_WORDS.alwaysDoSub
                      : describeRuleSentence(merchantRule)
                  }
                  onClick={() =>
                    merchantRule === null
                      ? openRuleStep('make', null)
                      : openRuleStep('edit', merchantRule.id)
                  }
                />
              )}
            {isWaiting && purchase.amountCents > 0 && (
              <LeaveOutRow isKeepFree purchase={purchase} onDone={onClose} />
            )}
            {isWaiting && <LeaveOutRow purchase={purchase} onDone={onClose} />}
            {placedRule !== null && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Repeat />}
                label={RULE_WORDS.placedBy(
                  nameOf(
                    purchase.lines.find((line) => line.via !== 'spill')
                      ?.envelopeId ?? placedRule.target,
                  ),
                )}
                subtitle={RULE_WORDS.placedBySub(
                  describeRuleSentence(placedRule),
                )}
                onClick={() => openRuleStep('edit', placedRule.id)}
              />
            )}
            {suggestion !== null && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Repeat />}
                label={RULE_WORDS.suggest(purchase.merchant?.trim() ?? '')}
                subtitle={RULE_WORDS.suggestSub(nameOf(suggestion.envelopeId))}
                onClick={() => openRuleStep('suggest', null)}
              />
            )}
            {paysRef !== null &&
              paysHorizon !== null &&
              paysCostName !== null && (
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={<HandCoins />}
                  label={PURCHASE_COST_WORDS.paysFact(
                    paysCostName,
                    paysHorizon.name,
                  )}
                  subtitle={PURCHASE_COST_WORDS.paysSub}
                  onClick={() => setIsCostOpen(true)}
                />
              )}
            {!isCameraFirst && (
              <ActionRow
                isGrouped
                isRoomy
                icon={<ImagePlus />}
                label={
                  canTakePhoto
                    ? SPEND_WORDS.chooseReceiptPhoto
                    : SPEND_WORDS.addReceipt
                }
                subtitle={
                  isAddingReceipt
                    ? SPEND_WORDS.receiptAdding
                    : receipts.length >= MAX_RECEIPTS_PER_PURCHASE
                      ? SPEND_WORDS.receiptLimit(MAX_RECEIPTS_PER_PURCHASE)
                      : SPEND_WORDS.addReceiptSub
                }
                isDisabled={
                  !isReceiptsLoaded ||
                  isAddingReceipt ||
                  receipts.length >= MAX_RECEIPTS_PER_PURCHASE
                }
                onClick={() => receiptChooser.current?.open()}
              />
            )}
            <ReceiptFileInput
              chooser={receiptChooser}
              onFiles={(files) => void addReceipts(files)}
            />
            {group !== null && hasGroupLink && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<Layers />}
                label={`${SPEND_WORDS.partOfGroup} ${mask(group.name)}`}
                subtitle={
                  groupPurchases === null
                    ? undefined
                    : groupPurchases.length === 1
                      ? '1 purchase'
                      : `${groupPurchases.length} purchases`
                }
                onClick={() => setGroupViewFor(purchase.id)}
              />
            )}
            {original && !isHidden && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<ReceiptText />}
                label={`${SPEND_WORDS.refundOf} ${getPurchaseTitle(original, nameOf)}`}
                onClick={() => openPurchase(original.id)}
              />
            )}
            {refundedCents > 0 && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron={refunds.length === 1}
                icon={<Undo2 />}
                label={`Refunded so far ${mask(formatCents(refundedCents))}`}
                onClick={() => {
                  if (refunds.length === 1) openPurchase(refunds[0].id);
                }}
                isDisabled={refunds.length !== 1}
              />
            )}
          </ActionGroup>
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
          <ActionRow
            isRoomy
            isDestructive
            icon={<Trash2 />}
            label={SPEND_WORDS.removeLabel}
            isDisabled={isBusy}
            onClick={() => void remove()}
          />
        </div>
      </FormSheet>
    </>
  );
}

export default PurchaseScreen;
