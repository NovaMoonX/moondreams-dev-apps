import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';

interface BankBadgeProps {
  name: string;
  linkId: string | null;
}

/** A linked account or card's badge: its bank's logo, or the bank's first letter when there is none. */
function BankBadge({ name, linkId }: BankBadgeProps) {
  const logo = useAppSelector((state) =>
    linkId === null
      ? null
      : (state.runway.links.find((link) => link.id === linkId)
          ?.institutionLogo ?? null),
  );
  if (logo === null) return <ItemBadge name={name} emoji={null} />;
  return (
    // Bank logos are drawn for a white ground, so the tile stays white in dark mode as a bank app's would.
    <img
      src={logo}
      alt=''
      aria-hidden='true'
      className='border-border size-10 shrink-0 rounded-xl border bg-white object-contain p-1'
    />
  );
}

export default BankBadge;
