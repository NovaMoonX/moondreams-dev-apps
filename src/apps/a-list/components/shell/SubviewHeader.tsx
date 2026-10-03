import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

interface SubviewHeaderProps {
  title: string;
  onBack: () => void;
}

function SubviewHeader({ title, onBack }: SubviewHeaderProps) {
  return (
    <div className='mb-4 flex items-center gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={title}
        onClick={onBack}
      >
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <h1 className='text-xl font-semibold'>{title}</h1>
    </div>
  );
}

export default SubviewHeader;
