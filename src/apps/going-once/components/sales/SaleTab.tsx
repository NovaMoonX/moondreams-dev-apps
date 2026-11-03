import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Trash2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import SummaryRow from '@/components/SummaryRow';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppSelector } from '@/store';
import { formatCentsShort } from '@/utils/moneyUtils';
import PeopleSection from '@apps/going-once/components/people/PeopleSection';
import FinishSection from '@apps/going-once/components/sales/FinishSection';
import LinkCard from '@apps/going-once/components/sales/LinkCard';
import PushSwitch from '@apps/going-once/components/sales/PushSwitch';
import PaymentMethodsSheet from '@apps/going-once/components/sales/PaymentMethodsSheet';
import SaleDetailSheet from '@apps/going-once/components/sales/SaleDetailSheet';
import {
  FINISHED_SALE_STATUS,
  SALE_DETAILS,
  SALE_DETAIL_NOTES,
} from '@apps/going-once/constants';
import { deleteSale } from '@apps/going-once/store/actions/saleActions';
import {
  selectItems,
  selectStatusSummary,
} from '@apps/going-once/store/selectors';
import type { Sale, SaleDetailField } from '@apps/going-once/types';
import { formatPaymentMethods } from '@apps/going-once/utils/paymentMethods';
import { toFirstName } from '@apps/going-once/utils/personName';
import { isSaleSeller } from '@apps/going-once/utils/roles';
import { formatOfAsked, type StatusView } from '@apps/going-once/utils/status';
import { formatStatusTotal } from '@apps/going-once/utils/statusSummary';

const DETAIL_FIELDS: SaleDetailField[] = ['name', 'pickupArea', 'buyerNote'];

const joinNames = (names: string[]) =>
  names.length < 3
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

const pluralize = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

interface SaleTabProps {
  sale: Sale;
  uid: string;
  myEmail: string | null;
  /** The person left the sale: go back to Your sales. */
  onLeft: () => void;
  /** Opens the Things tab on this status. */
  onOpenStatus: (view: StatusView) => void;
  /** The sale is gone: leave it. */
  onDeleted: () => void;
}

/** The Sale tab: where the sale stands, its details, and for the seller deleting it. */
const describeLosers = (count: number, names: string[]) => {
  if (count === 0) return [];
  const verb = count === 1 ? 'loses' : 'lose';
  if (names.includes('Someone'))
    return [`${pluralize(count, 'co-seller', 'co-sellers')} ${verb} access`];
  return [`${joinNames(names)} ${verb} access`];
};

function SaleTab({
  sale,
  uid,
  myEmail,
  onLeft,
  onOpenStatus,
  onDeleted,
}: SaleTabProps) {
  const { confirm } = useActionModal();
  const summary = useAppSelector((state) =>
    selectStatusSummary(state, sale.id),
  );
  const items = useAppSelector((state) => selectItems(state, sale.id));
  const areItemsReady = useAppSelector(
    (state) =>
      state.goingOnce.items.saleId === sale.id &&
      state.goingOnce.items.status === 'ready',
  );
  const coSellerIds = sale.members.filter((id) => id !== sale.ownerUid);
  const people = useUserInfo(coSellerIds);
  const [editing, setEditing] = useState<SaleDetailField | null>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isSeller = isSaleSeller(sale, uid);
  const isFinished = sale.status === FINISHED_SALE_STATUS;

  const handleDelete = async () => {
    const photoCount = items.reduce((sum, item) => sum + item.photos.length, 0);
    const collected = summary.SOLD.collectedCents;
    const names = coSellerIds.map((id) =>
      toFirstName(people?.map[id]?.displayName),
    );
    const losers = describeLosers(coSellerIds.length, names);
    const isConfirmed = await confirm({
      title: `Delete ${sale.name}?`,
      message: `This deletes the sale, its ${pluralize(items.length, 'thing', 'things')} and ${pluralize(photoCount, 'photo', 'photos')}${collected > 0 ? `, and the ${formatCentsShort(collected)} you recorded as collected` : ''}. ${losers.map((line) => `${line}. `).join('')}It can't be undone.`,
      confirmText: 'Delete this sale',
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteSale(sale.id);
    if (result.outcome === 'deleted') {
      onDeleted();
      return;
    }
    setIsDeleting(false);
    setDeleteError(result.reason);
  };

  return (
    <div className='space-y-6'>
      {isFinished && (
        <FinishSection sale={sale} isSeller={isSeller} summary={summary} />
      )}
      {items.length > 0 && (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
          <StatTile
            label='Collected'
            value={formatCentsShort(summary.SOLD.collectedCents)}
            detail={formatOfAsked(summary.SOLD.askedCents)}
            isLabelWrapped
            hasChevron
            onOpen={{
              label: 'Collected: open the sold things',
              onClick: () => onOpenStatus('SOLD'),
            }}
          />
          <StatTile
            label='Pending'
            value={summary.PENDING.count}
            detail={formatStatusTotal('PENDING', summary)}
            isLabelWrapped
            hasChevron
            onOpen={{
              label: 'Pending: open the pending things',
              onClick: () => onOpenStatus('PENDING'),
            }}
          />
          <StatTile
            className='col-span-2 sm:col-span-1'
            label={isFinished ? "Didn't sell" : 'Left'}
            value={summary.AVAILABLE.count}
            detail={formatStatusTotal('AVAILABLE', summary)}
            isLabelWrapped
            hasChevron
            onOpen={{
              label: `${isFinished ? "Didn't sell" : 'Left'}: open the available things`,
              onClick: () => onOpenStatus('AVAILABLE'),
            }}
          />
        </div>
      )}
      {items.length === 0 && areItemsReady && (
        <p className='text-muted-foreground text-sm text-pretty'>
          Add your first thing and what you&apos;ve sold shows up here.
        </p>
      )}

      <LinkCard sale={sale} isSeller={isSeller} />

      {!isFinished && <PushSwitch saleId={sale.id} uid={uid} />}

      <PeopleSection sale={sale} uid={uid} myEmail={myEmail} onLeft={onLeft} />

      <div className='space-y-2'>
        <SectionDivider label='Details' />
        {DETAIL_FIELDS.map((field) => {
          const { label, empty } = SALE_DETAILS[field];
          const value = sale[field];
          return (
            <SummaryRow
              key={field}
              label={label}
              detail={SALE_DETAIL_NOTES[field]}
              onClick={isSeller ? () => setEditing(field) : undefined}
            >
              {value === null || value === '' ? (
                <span className='text-muted-foreground'>
                  {isSeller ? empty : 'Not set'}
                </span>
              ) : (
                <span className='line-clamp-3'>{value}</span>
              )}
            </SummaryRow>
          );
        })}
        <SummaryRow
          label='Payment methods'
          detail='Buyers see this'
          onClick={isSeller ? () => setIsEditingPayment(true) : undefined}
        >
          {sale.paymentMethods.length === 0 ? (
            <span className='text-muted-foreground'>
              {isSeller ? 'Add the ways buyers can pay' : 'Not set'}
            </span>
          ) : (
            <span className='line-clamp-3'>
              {formatPaymentMethods(sale.paymentMethods)}
            </span>
          )}
        </SummaryRow>
      </div>

      {!isFinished && (
        <FinishSection sale={sale} isSeller={isSeller} summary={summary} />
      )}

      {isSeller && (
        <div className='space-y-2'>
          <ActionRow
            isRoomy
            isDestructive
            icon={<Trash2 />}
            label={isDeleting ? 'Deleting…' : 'Delete this sale'}
            subtitle='Removes its things and photos for good.'
            isDisabled={isDeleting || !areItemsReady}
            onClick={() => void handleDelete()}
          />
          {deleteError && (
            <p role='alert' className='text-destructive text-sm'>
              {deleteError}
            </p>
          )}
        </div>
      )}

      {isEditingPayment && (
        <PaymentMethodsSheet
          saleId={sale.id}
          value={sale.paymentMethods}
          onClose={() => setIsEditingPayment(false)}
        />
      )}

      {editing !== null && (
        <SaleDetailSheet
          key={editing}
          saleId={sale.id}
          field={editing}
          value={sale[editing]}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default SaleTab;
