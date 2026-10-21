import { join } from '@moondreamsdev/dreamer-ui/utils';

interface SharedBrandProps {
  /** Names the kind of thing the page holds; a page with nothing to show leaves it out. */
  eyebrow?: string;
  className?: string;
}

/** The logo and name every public page opens with, a link that doesn't open included. */
function SharedBrand({ eyebrow, className }: SharedBrandProps) {
  return (
    <div className={join('flex items-center justify-between gap-3', className)}>
      <span className='flex items-center gap-2.5'>
        <img
          src='/logos/by-app/logo-pinch.svg'
          alt=''
          className='size-9 rounded-xl'
        />
        <span className='font-semibold'>Pinch</span>
      </span>
      {eyebrow && (
        <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          {eyebrow}
        </span>
      )}
    </div>
  );
}

export default SharedBrand;
