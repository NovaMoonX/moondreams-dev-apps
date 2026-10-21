import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@/components/FallbackImage';

interface IngredientIconProps {
  iconKey: string | null;
  /** Edge length in pixels. */
  size?: number;
  className?: string;
}

function JarGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      className='text-muted-foreground'
    >
      <path d='M8 3h8v3H8z' />
      <path d='M7 6h10l1 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z' />
      <path d='M6.5 12h11' />
    </svg>
  );
}

/** A vendored emoji icon for an ingredient, or a plain jar when there is no matching one. */
function IngredientIcon({
  iconKey,
  size = 32,
  className,
}: IngredientIconProps) {
  const jar = <JarGlyph size={size} />;

  return (
    <span
      className={join(
        'inline-flex shrink-0 items-center justify-center',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {iconKey ? (
        <FallbackImage
          src={`/vendor/ingredient-icons/${iconKey}.svg`}
          alt=''
          width={size}
          height={size}
          fallback={jar}
          className='h-full w-full object-contain'
        />
      ) : (
        jar
      )}
    </span>
  );
}

export default IngredientIcon;
