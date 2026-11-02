import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Trash2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import SummaryRow from '@/components/SummaryRow';
import { useAppSelector } from '@/store';
import { formatCentsShort } from '@/utils/moneyUtils';
import SaleDetailSheet from '@apps/going-once/components/sales/SaleDetailSheet';
import { SALE_DETAILS } from '@apps/going-once/constants';
import { deleteSale } from '@apps/going-once/store/actions/saleActions';
import {
  selectItems,
  selectStatusSummary,
} from '@apps/going-once/store/selectors';
import type { Sale, SaleDetailField } from '@apps/going-once/types';
import { formatOfAsked, type StatusView } from '@apps/going-once/utils/status';
import { formatStatusTotal } from '@apps/going-once/utils/statusSummary';

const DETAIL_FIELDS: SaleDetailField[] = ['name', 'pickupArea', 'buyerNote'];

const pluralize = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

interface SaleTabProps {
  sale: Sale;
  uid: string;
  /** Opens the Things tab on this status. */
  onOpenStatus: (view: StatusView) => void;
  /** The sale is gone: leave it. */
  onDeleted: () => void;
}

/** The Sale tab: where the sale stands, its details, and for the seller deleting it. */
function SaleTab({ sale, uid, onOpenStatus, onDeleted }: SaleTabProps) {
  const { confirm } = useActionModal();
  const summary = useAppSelector((state) =>
    selectStatusSummary(state, sale.id),
  );
  const items = useAppSelector((state) => selectItems(state, sale.id));
  const [editing, setEditing] = useState<SaleDetailField | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isSeller = sale.ownerUid === uid;

  const handleDelete = async () => {
    const photoCount = items.reduce((sum, item) => sum + item.photos.length, 0);
    const isConfirmed = await confirm({
      title: `Delete ${sale.name}?`,
      message: `This deletes the sale, its ${pluralize(items.length, 'thing', 'things')} and ${pluralize(photoCount, 'photo', 'photos')}${summary.SOLD.count > 0 ? ', and what you recorded as sold' : ''}. It can't be undone.`,
      confirmText: 'Delete this sale',
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsDeleting(true);
    setDeleteError(null);
    const reason = await deleteSale(sale.id);
    if (reason === null) {
      onDeleted();
      return;
    }
    setIsDeleting(false);
    setDeleteError(reason);
  };

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 gap-2'>
        <StatTile
          label='Collected'
          value={formatCentsShort(summary.SOLD.collectedCents)}
          detail={formatOfAsked(summary.SOLD.askedCents)}
          isLabelWrapped
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
          onOpen={{
            label: 'Pending: open the pending things',
            onClick: () => onOpenStatus('PENDING'),
          }}
        />
        <StatTile
          className='col-span-2'
          label='Left'
          value={summary.AVAILABLE.count}
          detail={formatStatusTotal('AVAILABLE', summary)}
          onOpen={{
            label: 'Left: open the available things',
            onClick: () => onOpenStatus('AVAILABLE'),
          }}
        />
      </div>

      <div className='space-y-2'>
        <SectionDivider label='Details' />
        {DETAIL_FIELDS.map((field) => {
          const { label, empty } = SALE_DETAILS[field];
          const value = sale[field];
          return (
            <SummaryRow
              key={field}
              label={label}
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
      </div>

      {isSeller && (
        <div className='space-y-2'>
          <ActionRow
            isRoomy
            isDestructive
            icon={<Trash2 />}
            label={isDeleting ? 'Deleting…' : 'Delete this sale'}
            subtitle='Removes it, its things and their photos for good.'
            isDisabled={isDeleting}
            onClick={() => void handleDelete()}
          />
          {deleteError && (
            <p role='alert' className='text-destructive text-sm'>
              {deleteError}
            </p>
          )}
        </div>
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
