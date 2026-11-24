import { useAppSelector } from '@/store';
import BankLogo from '@apps/runway/components/BankLogo';
import ItemBadge from '@apps/runway/components/ItemBadge';

interface BankBadgeProps {
  name: string;
  linkId: string | null;
}

/** A linked account or card's badge: its bank's logo, or the bank's first letter when there is none. */
function BankBadge({ name, linkId }: BankBadgeProps) {
  const link = useAppSelector((state) =>
    linkId === null
      ? null
      : (state.runway.links.find((entry) => entry.id === linkId) ?? null),
  );
  const letter = <ItemBadge name={name} emoji={null} />;
  if (link === null) return letter;
  return (
    // Bank logos are drawn for a white ground, so the tile stays white in dark mode as a bank app's would.
    <BankLogo
      link={link}
      className='border-border size-10 shrink-0 rounded-xl border bg-white object-contain p-1'
      fallback={letter}
    />
  );
}

export default BankBadge;
