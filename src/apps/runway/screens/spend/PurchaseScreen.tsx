import { useLayoutEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Layers,
  Pencil,
  ReceiptText,
  Trash2,
  Undo2,
} from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import ExternalLinkText from '@/components/ExternalLinkText';
import FormSheet from '@/components/FormSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { maskFigures } from '@apps/runway/utils/maskText';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { getWebLinkHost } from '@/utils/urlUtils';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  MAX_RECEIPTS_PER_PURCHASE,
  RECEIPT_TEXT_LINES_SHOWN,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { keepEntryFor } from '@apps/runway/utils/leaveAfterClose';
import type { OpenPurchase } from '@apps/runway/types';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import ExpenseView from '@apps/runway/components/ExpenseView';
import ReceiptFileInput, {
  type ReceiptChooser,
} from '@apps/runway/components/ReceiptFileInput';
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
import SheetHead from '@apps/runway/components/SheetHead';
import { useExpensePurchases } from '@apps/runway/hooks/useExpensePurchases';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { deletePurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectExpenses,
  selectIsMovesLoaded,
  selectItemLooks,
  selectSpendPurchases,
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
}

/** One purchase: what it was, where it came from, and the ways to change or remove it. */
function PurchaseScreen({
  purchaseId,
  onOpen,
  onClose,
  fallback = null,
}: PurchaseScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { isHidden } = useValuesHidden();
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const mask = (text: string) => (isHidden ? maskFigures(text) : text);
  const { openPurchase: openPurchaseInUrl } = useRunwayUrlState();
  const openPurchase = onOpen ?? openPurchaseInUrl;
  const { addToast } = useToast();
  const purchases = useAppSelector(selectSpendPurchases);
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const looks = useAppSelector(selectItemLooks);
  const expenses = useAppSelector(selectExpenses);
  const [editTarget, setEditTarget] = useState<{
    key: number;
    purchase: OpenPurchase;
  } | null>(null);
  const [groupViewFor, setGroupViewFor] = useState<string | null>(null);
  const receiptChooser = useRef<ReceiptChooser>(null);
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

  const purchase =
    purchases.find((entry) => entry.id === purchaseId) ??
    (fallback?.id === purchaseId ? fallback : null);
  const group =
    expenses.find((entry) => entry.id === purchase?.expenseId) ?? null;
  const groupRead = useExpensePurchases(group?.id ?? null);
  const groupPurchases = groupRead.purchases;
  const receiptsResult = useReceiptImages(purchaseId);
  const receipts =
    receiptsResult.status === 'loaded' ? receiptsResult.images : [];
  const isReceiptsLoaded = receiptsResult.status === 'loaded';
  const viewedReceipt =
    receipts.find((entry) => entry.id === receiptViewId) ?? null;
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';

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
  const fact = [
    formatDateShortUTC(purchase.date),
    ...(facts.length > 0
      ? facts
      : [refund && !isHidden ? `refund to ${envelopes}` : envelopes]),
  ].join(' · ');
  const note = purchase.note?.trim() || null;
  const receiptText = purchase.receiptText?.trim() || null;
  const receiptRows = receiptText?.split('\n') ?? [];
  const hasMoreItems = receiptRows.length > RECEIPT_TEXT_LINES_SHOWN;
  const link = purchase.link?.trim() || null;
  const linkHost = link === null ? null : getWebLinkHost(link);

  const remove = async () => {
    if (!user || isBusy) return;
    const names = purchase.lines.map((line) =>
      line.envelopeId === null
        ? SPEND_WORDS.freeToSpend
        : nameOf(line.envelopeId),
    );
    const where = names.join(', ').replace(/, ([^,]*)$/, ' and $1');
    const isConfirmed = await confirm({
      title: SPEND_WORDS.removeTitle,
      message: mask(
        [
          `${title}, ${amount} on ${formatDateUTC(purchase.date)}.`,
          getRemovalEffect(names.length, where, amount, refund),
          refunds.length > 0
            ? `Its ${refunds.length === 1 ? 'refund stays' : `${refunds.length} refunds stay`}, and still return${refunds.length === 1 ? 's' : ''} money.`
            : null,
          receipts.length > 0
            ? SPEND_WORDS.receiptsRemovedWithPurchase(receipts.length)
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
                  <dd className='whitespace-pre-line'>
                    {mask(
                      (isItemsOpen || !hasMoreItems
                        ? receiptRows
                        : receiptRows.slice(0, RECEIPT_TEXT_LINES_SHOWN)
                      ).join('\n'),
                    )}
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
                purchase.lines.map((line, index) => (
                  <div
                    key={`${line.envelopeId ?? 'free'}-${index}`}
                    className='flex items-start justify-between gap-3 p-3'
                  >
                    <dt className='text-muted-foreground min-w-0 break-words'>
                      {line.envelopeId === null
                        ? SPEND_WORDS.freeToSpend
                        : nameOf(line.envelopeId)}
                    </dt>
                    <dd className='font-medium whitespace-nowrap tabular-nums'>
                      {mask(formatCents(Math.abs(line.cents)))}
                    </dd>
                  </div>
                ))}
            </dl>
          )}
          {receiptsResult.status === 'failed' && (
            <p className='text-muted-foreground text-sm'>
              {SPEND_WORDS.receiptsLoadFailed}
            </p>
          )}
          {receipts.length > 0 && (
            <ReceiptsBlock images={receipts} onOpen={openReceipt} />
          )}
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Pencil />}
              label={SPEND_WORDS.edit}
              isDisabled={isBusy}
              onClick={() => {
                keepEntryFor('purchase');
                setEditTarget((current) => ({
                  key: (current?.key ?? 0) + 1,
                  purchase,
                }));
              }}
            />
            <ActionRow
              isGrouped
              isRoomy
              icon={<ImagePlus />}
              label={SPEND_WORDS.addReceipt}
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
            <ReceiptFileInput
              chooser={receiptChooser}
              onFiles={(files) => void addReceipts(files)}
            />
            {group !== null && (
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
