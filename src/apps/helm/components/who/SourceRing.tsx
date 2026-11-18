import { join } from '@moondreamsdev/dreamer-ui/utils';

interface SourceRingProps {
  isConfirmed: boolean;
  label: string;
  className?: string;
}

/** The ink ring beside a fact: filled when the person said or confirmed it, hollow when the assistant inferred it. */
function SourceRing({ isConfirmed, label, className }: SourceRingProps) {
  return (
    <span
      role='img'
      aria-label={label}
      className={join(
        'border-foreground inline-block size-2.5 shrink-0 rounded-full border-[1.5px]',
        isConfirmed && 'bg-foreground',
        className,
      )}
    />
  );
}

export default SourceRing;
