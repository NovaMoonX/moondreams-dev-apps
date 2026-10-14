import { ShoppingBasket } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

interface AddToShoppingRowProps {
  subtitle: string;
  label?: string;
  onClick: () => void;
  isGrouped?: boolean;
}

function AddToShoppingRow({
  subtitle,
  label = 'Add to shopping list',
  onClick,
  isGrouped,
}: AddToShoppingRowProps) {
  return (
    <ActionRow
      icon={<ShoppingBasket className='h-4 w-4' />}
      label={label}
      subtitle={subtitle}
      onClick={onClick}
      isGrouped={isGrouped}
    />
  );
}

export default AddToShoppingRow;
