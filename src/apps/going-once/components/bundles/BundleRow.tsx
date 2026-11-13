import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import ThingThumb from '@apps/going-once/components/things/ThingThumb';
import { PAYMENT_METHOD_LABELS } from '@apps/going-once/constants';
import type {
  Bundle,
  BundleStatus,
  Item,
  ItemStatus,
} from '@apps/going-once/types';
import {
  getBundleParts,
  type BundleParts,
  shouldSuggestUnbundle,
} from '@apps/going-once/utils/bundles';
import { getStatusFacts } from '@apps/going-once/utils/status';
import {
  formatBundleFacts,
  formatThingCount,
} from '@apps/going-once/utils/bundleWords';

const BUNDLE_DOT_STATUS = {
  ACTIVE: 'AVAILABLE',
  PENDING: 'PENDING',
  SOLD: 'SOLD',
} as const satisfies Record<BundleStatus, ItemStatus>;

interface BundleRowProps {
  bundle: Bundle;
  itemsById: Record<string, Item>;
  onOpen: () => void;
}

/** What follows a sold bundle's word: what was paid, how, when, and how many things. */
const getSoldFacts = (bundle: Bundle) => {
  const { sale } = bundle;
  if (sale === null) return '';
  return [
    formatCentsShort(sale.priceCents),
    sale.method === null ? null : PAYMENT_METHOD_LABELS[sale.method],
    formatDateShortUTC(sale.soldOn),
    formatThingCount(bundle.dealItemIds?.length ?? 0),
  ]
    .filter((part) => part !== null)
    .join(' · ');
};

const getFacts = (
  bundle: Bundle,
  parts: BundleParts,
  isSuggesting: boolean,
) => {
  if (bundle.status === 'SOLD') return getSoldFacts(bundle);
  if (bundle.status === 'ACTIVE')
    return `· ${formatBundleFacts(bundle, parts, isSuggesting)}`;
  const hold = getStatusFacts(
    {
      status: 'PENDING',
      pending: parts.deal[0]?.pending ?? null,
      sale: null,
    },
    true,
  );
  return [hold === '' ? null : hold, formatBundleFacts(bundle, parts, false)]
    .filter((part) => part !== null)
    .join(' · ');
};

/** A bundle in the Things list: its first things stacked as a thumb, its name, its status and size, and its price as a kraft tag. */
function BundleRow({ bundle, itemsById, onOpen }: BundleRowProps) {
  const parts = getBundleParts(bundle, itemsById);
  const isSuggesting = shouldSuggestUnbundle(bundle, parts);
  const [first, second] = parts.deal.length > 0 ? parts.deal : parts.gone;
  const facts = getFacts(bundle, parts, isSuggesting);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left'
      onClick={onOpen}
    >
      <span className='relative size-12 shrink-0'>
        <ThingThumb
          item={first ?? null}
          className='absolute top-0 left-0 size-9 ring-2 ring-(--color-card)'
        />
        <ThingThumb
          item={second ?? null}
          className='absolute right-0 bottom-0 size-9 ring-2 ring-(--color-card)'
        />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 text-base font-medium break-words'>
          {bundle.name}
        </span>
        <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal break-words'>
          <StatusDot status={BUNDLE_DOT_STATUS[bundle.status]} isInline>
            {facts}
          </StatusDot>
        </span>
      </span>
      <PriceTag askingPriceCents={bundle.priceCents} />
    </Button>
  );
}

export default BundleRow;
