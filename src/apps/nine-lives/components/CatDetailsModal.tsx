import { Avatar, Modal, Tabs, TabsContent, TabsList, TabsTrigger } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { getInitials } from '@/utils/accountUtils';

import { useCatDetailSync } from '../hooks/useCatDetailSync';
import type { Cat } from '../types';
import CatConditionsSection from './CatConditionsSection';
import CatProfileForm from './CatProfileForm';
import SymptomsSection from './SymptomsSection';
import VaccinationsSection from './VaccinationsSection';
import WeightEntriesSection from './WeightEntriesSection';

interface CatDetailsModalProps {
  isOpen: boolean;
  cat: Cat | null;
  householdId?: string;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onDelete?: (cat: Cat) => Promise<void> | void;
  onClose: () => void;
}

function CatDetailsModal({
  isOpen,
  cat,
  householdId,
  isSubmitting,
  onSubmit,
  onDelete,
  onClose,
}: CatDetailsModalProps) {
  const { confirm } = useActionModal();

  useCatDetailSync(householdId, cat?.id);

  const handleDelete = async () => {
    if (!cat || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete cat',
      message: `Are you sure you want to delete ${cat.name}? This action cannot be undone.`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(cat);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {cat && (
        <div className='mb-4 flex flex-col items-center gap-2'>
          <Avatar
            src={cat.photoURL ?? undefined}
            alt={cat.name}
            initials={cat.photoURL ? undefined : getInitials(cat.name)}
            size='2xl'
            shape='circle'
          />
          <h2 className='text-lg font-semibold'>{cat.name}</h2>
        </div>
      )}

      <Tabs defaultValue='details' tabsWidth='full' variant='pills'>
        <TabsList>
          <TabsTrigger value='details'>Details</TabsTrigger>
          <TabsTrigger value='vaccinations' disabled={!cat || !householdId}>
            Vaccinations
          </TabsTrigger>
          <TabsTrigger value='weight' disabled={!cat || !householdId}>
            Weight history
          </TabsTrigger>
          <TabsTrigger value='conditions' disabled={!cat || !householdId}>
            Conditions
          </TabsTrigger>
          <TabsTrigger value='symptoms' disabled={!cat || !householdId}>
            Symptoms
          </TabsTrigger>
        </TabsList>

        <TabsContent value='details' className='pt-4'>
          <CatProfileForm
            key={cat?.id}
            cat={cat}
            householdId={householdId}
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
            onCancel={onClose}
            onDelete={handleDelete}
          />
        </TabsContent>

        {cat && householdId && (
          <>
            <TabsContent value='vaccinations' className='pt-4'>
              <VaccinationsSection householdId={householdId} catId={cat.id} catName={cat.name} />
            </TabsContent>

            <TabsContent value='weight' className='pt-4'>
              <WeightEntriesSection householdId={householdId} catId={cat.id} catName={cat.name} />
            </TabsContent>

            <TabsContent value='conditions' className='pt-4'>
              <CatConditionsSection householdId={householdId} catId={cat.id} catName={cat.name} />
            </TabsContent>

            <TabsContent value='symptoms' className='pt-4'>
              <SymptomsSection householdId={householdId} catId={cat.id} catName={cat.name} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </Modal>
  );
}

export default CatDetailsModal;
