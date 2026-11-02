import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import NewThingFlow from '@apps/going-once/components/things/NewThingFlow';
import ThingDrawer from '@apps/going-once/components/things/ThingDrawer';
import ThingRow from '@apps/going-once/components/things/ThingRow';
import {
  selectItems,
  selectItemsStatus,
  selectPhotoUploads,
} from '@apps/going-once/store/selectors';
import type { Item } from '@apps/going-once/types';

interface ItemsSectionProps {
  saleId: string;
  uid: string;
}

/** The Things tab: the sale's things, newest first, with the way to add one. */
function ItemsSection({ saleId, uid }: ItemsSectionProps) {
  const items = useAppSelector((state) => selectItems(state, saleId));
  const status = useAppSelector(selectItemsStatus);
  const uploads = useAppSelector(selectPhotoUploads);
  const [adding, setAdding] = useState<{ resume: Item | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = items.find((item) => item.id === openId) ?? null;

  const addButton = (
    <Button
      size='sm'
      rounded='full'
      onClick={() => setAdding({ resume: null })}
    >
      <Plus className='size-4' aria-hidden='true' />
      New thing
    </Button>
  );

  if (status === 'error') {
    return (
      <EmptyCard icon='⚠️'>
        We couldn&apos;t load this sale&apos;s things. Check your connection and
        refresh the page.
      </EmptyCard>
    );
  }

  return (
    <div className='space-y-4'>
      <SectionHeader title='Things' action={addButton} />
      {items.length === 0 && status === 'ready' && (
        <EmptyCard icon='🏷️'>
          Add your first thing: photos first, then a name and a price.
        </EmptyCard>
      )}
      {items.length > 0 && (
        <ul className='space-y-2'>
          {items.map((item) => (
            <li key={item.id}>
              <ThingRow
                item={item}
                uploadingCount={uploads[item.id] ?? 0}
                onOpen={() => setOpenId(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {openItem && (
        <ThingDrawer
          item={openItem}
          onClose={() => setOpenId(null)}
          onFinish={() => {
            setAdding({ resume: openItem });
            setOpenId(null);
          }}
        />
      )}
      {adding && (
        <NewThingFlow
          saleId={saleId}
          uid={uid}
          resume={adding.resume}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

export default ItemsSection;
