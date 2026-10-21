import { ShoppingBasket } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

interface AddToShoppingRowProps {
  subtitle: string;
  onClick: () => void;
}

function AddToShoppingRow({ subtitle, onClick }: AddToShoppingRowProps) {
  return (
    <ActionRow
      icon={<ShoppingBasket className='h-4 w-4' />}
      label='Add to shopping list'
      subtitle={subtitle}
      onClick={onClick}
    />
  );
}

export default AddToShoppingRow;
