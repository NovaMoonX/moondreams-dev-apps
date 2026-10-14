import { ShoppingBasket } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

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
    <ActionRow
      icon={<ShoppingBasket className='h-4 w-4' />}
      label={label}
      subtitle={subtitle}
      onClick={onClick}
    />
  );
}

export default AddToShoppingRow;
