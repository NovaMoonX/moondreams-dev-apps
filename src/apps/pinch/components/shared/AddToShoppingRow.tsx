import { ShoppingBasket } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

interface AddToShoppingRowProps {
  label?: string;
  subtitle: string;
  onClick: () => void;
  isGrouped?: boolean;
  isRoomy?: boolean;
}

function AddToShoppingRow({
  label = 'Add to shopping list',
  subtitle,
  onClick,
  isGrouped = false,
  isRoomy = false,
}: AddToShoppingRowProps) {
  return (
    <ActionRow
      icon={<ShoppingBasket className='h-4 w-4' />}
      label={label}
      subtitle={subtitle}
      onClick={onClick}
      isGrouped={isGrouped}
      isRoomy={isRoomy}
      hasChevron={isRoomy}
    />
  );
}

export default AddToShoppingRow;
