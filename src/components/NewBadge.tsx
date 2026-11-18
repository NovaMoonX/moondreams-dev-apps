import { join } from '@moondreamsdev/dreamer-ui/utils';

interface NewBadgeProps {
  className?: string;
}

/** A small "New" pill beside a title, for something added recently that the person hasn't opened yet. */
function NewBadge({ className }: NewBadgeProps) {
  return (
    <span
      className={join(
        'bg-primary text-primary-foreground inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] leading-none font-semibold',
        className,
      )}
    >
      New
    </span>
  );
}

export default NewBadge;
