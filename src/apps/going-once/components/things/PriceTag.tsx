import { formatAskingPrice } from '@apps/going-once/utils/listing';

interface PriceTagProps {
  askingPriceCents: number;
}

/** A kraft hang tag, its left end cut to a point with a punched hole: the price, or "Free". */
function PriceTag({ askingPriceCents }: PriceTagProps) {
  return (
    <span className="bg-accent text-accent-foreground before:bg-background before:ring-accent-foreground/25 relative inline-flex h-[26px] shrink-0 items-center rounded-r-md py-1 pr-2.5 pl-[22px] text-[13px] font-semibold tabular-nums [clip-path:polygon(10px_0,100%_0,100%_100%,10px_100%,0_50%)] before:absolute before:top-1/2 before:left-[9px] before:size-[5px] before:-translate-y-1/2 before:rounded-full before:ring-1 before:content-['']">
      {formatAskingPrice(askingPriceCents)}
    </span>
  );
}

export default PriceTag;
