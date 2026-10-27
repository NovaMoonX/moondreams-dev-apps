import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Eye, EyeOff } from 'lucide-react';

import { useValuesHidden } from '@/hooks/useValuesHidden';

/** The header's eye: shows or hides every private figure under the same provider. 28px round with a 40px hit area, like the other header icons. */
function ValuesEyeButton() {
  const { isHidden, toggle } = useValuesHidden();
  const label = isHidden ? 'Show amounts' : 'Hide amounts';
  const Icon = isHidden ? Eye : EyeOff;

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      className="relative size-7 p-0 after:absolute after:-inset-1.5 after:content-['']"
      aria-label={label}
      aria-pressed={!isHidden}
      title={label}
      onClick={toggle}
    >
      <Icon className='size-4' aria-hidden='true' />
    </Button>
  );
}

export default ValuesEyeButton;
