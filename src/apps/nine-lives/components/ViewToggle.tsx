import { Button } from '@moondreamsdev/dreamer-ui/components';
import { LineChart, List } from 'lucide-react';

export type ViewToggleValue = 'list' | 'chart';

interface ViewToggleProps {
  value: ViewToggleValue;
  onChange: (value: ViewToggleValue) => void;
}

function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className='border-border inline-flex items-center gap-0.5 rounded-md border p-0.5'>
      <Button
        type='button'
        variant={value === 'list' ? 'secondary' : 'link'}
        size='sm'
        className='px-2'
        aria-label='List view'
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <List className='h-4 w-4' />
      </Button>
      <Button
        type='button'
        variant={value === 'chart' ? 'secondary' : 'link'}
        size='sm'
        className='px-2'
        aria-label='Chart view'
        aria-pressed={value === 'chart'}
        onClick={() => onChange('chart')}
      >
        <LineChart className='h-4 w-4' />
      </Button>
    </div>
  );
}

export default ViewToggle;
