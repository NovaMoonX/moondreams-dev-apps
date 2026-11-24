import FallbackImage from '@/components/FallbackImage';
import ItemBadge from '@apps/runway/components/ItemBadge';

interface PurchaseMarkProps {
  logo: string | null;
  name: string;
  emoji: string | null;
}

/** A merchant's logo at 40px, falling back to the badge of the envelope it went to when there is none or it fails to load. */
function PurchaseMark({ logo, name, emoji }: PurchaseMarkProps) {
  const badge = <ItemBadge name={name} emoji={emoji} />;
  if (logo === null || !logo.startsWith('https://')) return badge;
  return (
    <FallbackImage
      src={logo}
      alt=''
      aria-hidden='true'
      className='border-border size-10 shrink-0 rounded-xl border bg-white object-contain p-1'
      fallback={badge}
    />
  );
}

export default PurchaseMark;
