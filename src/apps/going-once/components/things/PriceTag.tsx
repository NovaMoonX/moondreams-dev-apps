import { formatAskingPrice } from '@apps/going-once/utils/listing';

interface PriceTagProps {
  askingPriceCents: number;
}

/** A kraft hang tag like the Tag icon: a rounded box whose left end is a rounded point with a punched hole; the price, or "Free". */
function PriceTag({ askingPriceCents }: PriceTagProps) {
  return (
    <span className="text-accent-foreground before:bg-background before:ring-accent-foreground/25 relative inline-flex h-[26px] shrink-0 items-stretch before:absolute before:top-1/2 before:left-[10px] before:size-[5px] before:-translate-y-1/2 before:rounded-full before:ring-1 before:content-['']">
      <svg
        viewBox='0 0 16 26'
        className='fill-accent stroke-accent h-full w-4 shrink-0 overflow-hidden'
        strokeWidth={4}
        strokeLinejoin='round'
        aria-hidden='true'
      >
        <path d='M2 13 L13 2 H18 V24 H13 Z' />
      </svg>
      <span className='bg-accent flex items-center rounded-r-md pr-2.5 pl-1.5 text-[13px] font-semibold tabular-nums'>
        {formatAskingPrice(askingPriceCents)}
      </span>
    </span>
  );
}

export default PriceTag;
