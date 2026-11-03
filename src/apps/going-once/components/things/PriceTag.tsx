import { formatAskingPrice } from '@apps/going-once/utils/listing';

interface PriceTagProps {
  askingPriceCents: number;
}

/** A kraft price tag with a punched hole at its left edge: the price, or "Free". */
function PriceTag({ askingPriceCents }: PriceTagProps) {
  return (
    <span className="bg-accent text-accent-foreground before:bg-background relative inline-flex shrink-0 items-center rounded-lg py-1 pr-2.5 pl-4 text-[13px] font-semibold tabular-nums before:absolute before:top-1/2 before:left-1.5 before:size-1 before:-translate-y-1/2 before:rounded-full before:content-['']">
      {formatAskingPrice(askingPriceCents)}
    </span>
  );
}

export default PriceTag;
