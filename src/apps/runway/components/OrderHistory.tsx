import { PackageX, ShoppingBag, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
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

/** A store order's number and what happened to it since, shown once a store's email named the order or something came back from it. */
function OrderHistory({ order, refunds, mask, onOpen }: OrderHistoryProps) {
  const orderNumber = order.storeEmail?.orderNumber ?? null;
  const hasHistory = (order.orderLog ?? []).length > 0 || refunds.length > 0;
  if (orderNumber === null && !hasHistory) return null;
  const caption =
    orderNumber === null
      ? STORE_ORDER_WORDS.history
      : STORE_ORDER_WORDS.orderNumber(orderNumber);
  return (
    <ActionGroup isRoomy caption={caption}>
      {getOrderEntries(order, refunds).map(
        ({ key, on, icon: Icon, label, cents, opensId }) => (
          <ActionRow
            key={key}
            isGrouped
            isRoomy
            hasChevron={opensId !== null}
            icon={<Icon />}
            label={
              cents === null ? label : `${label} ${mask(formatCents(cents))}`
            }
            subtitle={formatDateOrdinalUTC(on)}
            onClick={() => {
              if (opensId !== null) onOpen(opensId);
            }}
          />
        ),
      )}
    </ActionGroup>
  );
}

export default OrderHistory;
