interface CountBadgeProps {
  count: number;
}

/** A fixed-size circle so the count stays visually round regardless of digit width. */
function CountBadge({ count }: CountBadgeProps) {
  return (
    <span className='inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground'>
      {count}
    </span>
  );
}

export default CountBadge;
