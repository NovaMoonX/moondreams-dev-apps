import { useState } from 'react';
import { Pencil, ReceiptText, Trash2, Undo2 } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { SPEND_WORDS } from '@apps/runway/constants';
import type { OpenPurchase } from '@apps/runway/types';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import SheetHead from '@apps/runway/components/SheetHead';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { deletePurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectIsMovesLoaded,
  selectItemLooks,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  describeEnvelopes,
  describePurchaseRemoval,
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
}

/** One purchase: what it was, where it came from, and the ways to change or remove it. */
function PurchaseScreen({ purchaseId, onOpen, onClose }: PurchaseScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { openPurchase: openPurchaseInUrl } = useRunwayUrlState();
  const openPurchase = onOpen ?? openPurchaseInUrl;
  const { addToast } = useToast();
  const purchases = useAppSelector(selectSpendPurchases);
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const looks = useAppSelector(selectItemLooks);
  const [editTarget, setEditTarget] = useState<{
    key: number;
    purchase: OpenPurchase;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchase = purchases.find((entry) => entry.id === purchaseId) ?? null;
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
  const title = getPurchaseTitle(purchase, nameOf);
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
  const fact = [
    formatDateShortUTC(purchase.date),
    refund ? `refund to ${envelopes}` : envelopes,
  ].join(' · ');
  const extraText = [
    purchase.merchant?.trim() && purchase.merchant.trim() !== title
      ? purchase.merchant.trim()
      : null,
    purchase.note?.trim() && purchase.note.trim() !== title
      ? purchase.note.trim()
      : null,
  ].filter((text): text is string => Boolean(text));

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
      message: [
        `${title}, ${amount} on ${formatDateUTC(purchase.date)}.`,
        getRemovalEffect(names.length, where, amount, refund),
        refunds.length > 0
          ? `Its ${refunds.length === 1 ? 'refund stays' : `${refunds.length} refunds stay`}, and still return${refunds.length === 1 ? 's' : ''} money.`
          : null,
        'It stays in the change log.',
      ]
        .filter(Boolean)
        .join(' '),
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
      addToast({ title: 'Purchase removed', type: 'success' });
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

  return (
    <>
      <FormSheet isOpen isDrawerWhenShort onClose={onClose} title={title}>
        <div className='space-y-4 pb-4'>
          <SheetHead
            label={SPEND_WORDS.detailTitle}
            figure={refund ? `+${amount}` : amount}
            fact={fact}
          />
          {(extraText.length > 0 || purchase.lines.length > 1) && (
            <dl className='border-border bg-card divide-border divide-y rounded-2xl border text-sm'>
              {extraText.map((text) => (
                <div key={text} className='p-3 break-words'>
                  <dt className='sr-only'>{SPEND_WORDS.note}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
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
                      {formatCents(Math.abs(line.cents))}
                    </dd>
                  </div>
                ))}
            </dl>
          )}
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Pencil />}
              label={SPEND_WORDS.edit}
              isDisabled={isBusy}
              onClick={() =>
                setEditTarget((current) => ({
                  key: (current?.key ?? 0) + 1,
                  purchase,
                }))
              }
            />
            {original && (
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
                label={`Refunded so far ${formatCents(refundedCents)}`}
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
      {editTarget !== null && (
        <PurchaseForm
          key={editTarget.key}
          isOpen
          editing={editTarget.purchase}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  );
}

export default PurchaseScreen;
