import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, PackageX, ShoppingBag, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { STORE_ORDER_WORDS } from '@apps/runway/constants';
import type { DateOnly, OpenPurchase } from '@apps/runway/types';

interface Entry {
  key: string;
  on: DateOnly;
  icon: typeof ShoppingBag;
  label: string;
  cents: number | null;
  opensId: string | null;
}

/** The entries of an order's history, oldest first: the order, each cancellation taken off it and each refund tied to it. */
function getOrderEntries(
  order: OpenPurchase,
  refunds: readonly OpenPurchase[],
): Entry[] {
  const log = order.orderLog ?? [];
  const takenOff = log
    .filter((entry) => entry.undoneAt === null)
    .reduce((sum, entry) => sum + entry.cents, 0);
  const cancels = log.map((entry, index): Entry => ({
    key: `cancel-${index}`,
    on: entry.on,
    icon: PackageX,
    label:
      entry.undoneAt === null
        ? STORE_ORDER_WORDS.cancelled
        : STORE_ORDER_WORDS.cancelledUndone,
    cents: entry.cents,
    opensId: entry.purchaseId,
  }));
  const returned = refunds.map((refund): Entry => ({
    key: refund.id,
    on: refund.date,
    icon: Undo2,
    label:
      refund.storeEmail?.kind === 'cancel'
        ? STORE_ORDER_WORDS.cancelled
        : STORE_ORDER_WORDS.refunded,
    cents: -refund.amountCents,
    opensId: refund.id,
  }));
  return [
    {
      key: 'order',
      on: order.date,
      icon: ShoppingBag,
      label: STORE_ORDER_WORDS.ordered,
      cents: order.amountCents + takenOff,
      opensId: null,
    },
    ...[...cancels, ...returned].sort((a, b) => a.on - b.on),
  ];
}

interface OrderHistoryProps {
  order: OpenPurchase;
  refunds: readonly OpenPurchase[];
  mask: (text: string) => string;
  onOpen: (purchaseId: string) => void;
}

/** A store order's number and what happened to it since, shown once something came off or back from it. */
function OrderHistory({ order, refunds, mask, onOpen }: OrderHistoryProps) {
  const orderNumber = order.storeEmail?.orderNumber ?? null;
  const hasHistory = (order.orderLog ?? []).length > 0 || refunds.length > 0;
  if (!hasHistory) return null;
  const caption =
    orderNumber === null
      ? STORE_ORDER_WORDS.history
      : STORE_ORDER_WORDS.orderNumber(orderNumber);
  return (
    <ActionGroup isRoomy caption={caption}>
      {getOrderEntries(order, refunds).map(
        ({ key, on, icon: Icon, label, cents, opensId }) => {
          const mark = (
            <span
              className='bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5'
              aria-hidden='true'
            >
              <Icon />
            </span>
          );
          const words = (
            <span className='min-w-0 flex-1 text-left'>
              <span className='block font-medium'>{label}</span>
              <span className='text-muted-foreground block text-sm'>
                {formatDateOrdinalUTC(on)}
              </span>
            </span>
          );
          const figure =
            cents === null ? null : (
              <span className='shrink-0 font-medium whitespace-nowrap tabular-nums'>
                {mask(formatCents(cents))}
              </span>
            );
          if (opensId === null) {
            return (
              <div key={key} className='flex items-center gap-3 px-3 py-3'>
                {mark}
                {words}
                {figure}
              </div>
            );
          }
          return (
            <Button
              key={key}
              type='button'
              variant='tertiary'
              size='stripped'
              rounded='none'
              className='hover:bg-muted text-foreground! w-full items-center justify-start gap-3 px-3 py-3 font-normal whitespace-normal'
              onClick={() => onOpen(opensId)}
            >
              {mark}
              {words}
              {figure}
              <ChevronRight
                className='text-muted-foreground size-5 shrink-0'
                aria-hidden='true'
              />
            </Button>
          );
        },
      )}
    </ActionGroup>
  );
}

export default OrderHistory;
