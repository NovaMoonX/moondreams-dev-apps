import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { SPEND_WORDS } from '@apps/runway/constants';
import type { OpenPurchase } from '@apps/runway/types';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { deletePurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectIsMovesLoaded,
  selectItemLooks,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  describePurchaseRemoval,
  getPurchaseTitle,
  isRefund,
} from '@apps/runway/utils/purchaseText';

interface PurchaseScreenProps {
  purchaseId: string;
  onClose: () => void;
}

/** One purchase: what it was, where it came from, and the ways to change or remove it. */
function PurchaseScreen({ purchaseId, onClose }: PurchaseScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
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
      <Subview title={SPEND_WORDS.detailTitle} onClose={onClose}>
        <p className='text-muted-foreground text-sm'>
          {isLoaded ? SPEND_WORDS.notFound : 'Getting your plan.'}
        </p>
      </Subview>
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
  const rows = [
    ['Day', formatDateUTC(purchase.date)],
    purchase.merchant?.trim() ? [SPEND_WORDS.where, purchase.merchant] : null,
    purchase.note?.trim() ? [SPEND_WORDS.note, purchase.note] : null,
    original
      ? [SPEND_WORDS.refundOf, getPurchaseTitle(original, nameOf)]
      : null,
    refundedCents > 0 ? ['Refunded so far', formatCents(refundedCents)] : null,
  ].filter((row): row is string[] => row !== null);

  const remove = async () => {
    if (!user || isBusy) return;
    const where = purchase.lines
      .map((line) =>
        line.envelopeId === null
          ? SPEND_WORDS.freeToSpend
          : nameOf(line.envelopeId),
      )
      .join(', ');
    const isConfirmed = await confirm({
      title: SPEND_WORDS.removeTitle,
      message: [
        `${title}, ${amount} on ${formatDateUTC(purchase.date)}.`,
        refund
          ? `${where} will have ${amount} less back.`
          : `${where} gets ${amount} back.`,
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
    <Subview
      title={SPEND_WORDS.detailTitle}
      onClose={onClose}
      headerAction={
        <DeleteIconButton
          label={SPEND_WORDS.removeLabel}
          disabled={isBusy}
          onClick={() => {
            void remove();
          }}
        />
      }
    >
      <div className='space-y-4'>
        <div className='border-border bg-accent rounded-2xl border p-4'>
          <p className='line-clamp-2 font-medium break-words'>{title}</p>
          <p className='text-3xl font-semibold tracking-tight tabular-nums'>
            {refund ? `+${amount}` : amount}
          </p>
        </div>
        <dl className='border-border bg-card divide-border divide-y rounded-2xl border'>
          {rows.map(([name, value]) => (
            <div
              key={name}
              className='flex items-start justify-between gap-3 p-3'
            >
              <dt className='text-muted-foreground shrink-0 text-sm'>{name}</dt>
              <dd className='min-w-0 text-right break-words'>{value}</dd>
            </div>
          ))}
          {purchase.lines.map((line, index) => (
            <div
              key={`${line.envelopeId ?? 'free'}-${index}`}
              className='flex items-start justify-between gap-3 p-3'
            >
              <dt className='min-w-0 text-sm break-words'>
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
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <Button
          variant='secondary'
          disabled={isBusy}
          onClick={() =>
            setEditTarget((current) => ({
              key: (current?.key ?? 0) + 1,
              purchase,
            }))
          }
        >
          {SPEND_WORDS.edit}
        </Button>
        {editTarget !== null && (
          <PurchaseForm
            key={editTarget.key}
            isOpen
            editing={editTarget.purchase}
            onClose={() => setEditTarget(null)}
          />
        )}
      </div>
    </Subview>
  );
}

export default PurchaseScreen;
