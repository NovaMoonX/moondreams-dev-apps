import { useState } from 'react';

import { keepEntryFor } from '@/hooks/useBackHistory';
import ThingDrawer from '@apps/going-once/components/things/ThingDrawer';
import ThingForm from '@apps/going-once/components/things/ThingForm';
import type { Inquiry, Item } from '@apps/going-once/types';
import type { StatusFigures } from '@apps/going-once/utils/statusSummary';

interface OpenThingProps {
  item: Item;
  uid: string;
  isSeller: boolean;
  /** Every sold thing in the sale, for Collected. */
  sold: StatusFigures;
  /** Opens straight on Mark pending, held for this person. */
  holdFor?: Inquiry | null;
  onClose: () => void;
  /** Reopens the add-a-thing walk-through on this thing. */
  onFinish: () => void;
}

/** A thing's drawer, and its Modify form once asked for, wherever the thing was opened from. */
function OpenThing({
  item,
  uid,
  isSeller,
  sold,
  holdFor = null,
  onClose,
  onFinish,
}: OpenThingProps) {
  const [isModifying, setIsModifying] = useState(false);

  if (isModifying)
    return (
      <ThingForm
        item={item}
        uid={uid}
        isSeller={isSeller}
        onClose={() => setIsModifying(false)}
      />
    );

  return (
    <ThingDrawer
      item={item}
      uid={uid}
      isSeller={isSeller}
      sold={sold}
      holdFor={holdFor}
      onClose={onClose}
      onFinish={onFinish}
      onModify={() => {
        keepEntryFor('thing');
        setIsModifying(true);
      }}
    />
  );
}

export default OpenThing;
