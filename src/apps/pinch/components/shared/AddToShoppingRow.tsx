import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ShoppingBasket } from 'lucide-react';

interface AddToShoppingRowProps {
  subtitle: string;
  label?: string;
  onClick: () => void;
}

function AddToShoppingRow({
  subtitle,
  label = 'Add to shopping list',
  onClick,
}: AddToShoppingRowProps) {
  return (
    <div className='bg-muted/50 border-border overflow-hidden rounded-2xl border'>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-12 w-full justify-start gap-3 rounded-none py-2 text-left'
        onClick={onClick}
      >
        <span className='w-5 shrink-0' aria-hidden='true'>
          <ShoppingBasket className='h-4 w-4' />
        </span>
        <span className='min-w-0 text-left'>
          <span className='block'>{label}</span>
          <span className='text-muted-foreground block text-xs font-normal'>
            {subtitle}
          </span>
        </span>
      </Button>
    </div>
  );
}

export default AddToShoppingRow;
