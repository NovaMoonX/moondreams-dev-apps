interface ItemBadgeProps {
  name: string;
  emoji: string | null;
}

/** The small square an envelope wears in a list: its emoji, or the first letter of its name. */
function ItemBadge({ name, emoji }: ItemBadgeProps) {
  const label = emoji ?? Array.from(name.trim())[0]?.toUpperCase() ?? '';

  return (
    <span
      className='border-border bg-accent text-foreground grid size-10 shrink-0 place-items-center rounded-xl border text-lg leading-none font-semibold'
      aria-hidden='true'
    >
      {label}
    </span>
  );
}

export default ItemBadge;
