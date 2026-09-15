import {
  Avatar,
  Modal,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ImageUploadField from '@/components/forms/ImageUploadField';
import { useImageUpload } from '@/hooks/useImageUpload';
import { getInitials } from '@/utils/accountUtils';
import { deleteFile, uploadFile } from '@lib/firebase/storage';

import { useCatDetailSync } from '../hooks/useCatDetailSync';
import type { Cat } from '../types';
import CatConditionsSection from './CatConditionsSection';
import CatProfileForm from './CatProfileForm';
import HealthRecordsSection from './HealthRecordsSection';
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
        <CatDetailsModalContent
          key={cat.id}
          cat={cat}
          householdId={householdId}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          onDelete={onDelete ? handleDelete : undefined}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

interface CatDetailsModalContentProps {
  cat: Cat;
  householdId?: string;
  isSubmitting?: boolean;
  onSubmit: (nextCat: Cat) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

/** Keyed by `cat.id` in the parent so photo-picker state resets when switching cats without remounting the modal itself. */
function CatDetailsModalContent({
  cat,
  householdId,
  isSubmitting,
  onSubmit,
  onDelete,
  onClose,
}: CatDetailsModalContentProps) {
  const photoUpload = useImageUpload(cat.photoURL ?? null);
  const photoRemoved = photoUpload.previewUrl === null && Boolean(cat.photoURL);

  const handleFormSubmit = async (nextCat: Cat) => {
    let photoURL = nextCat.photoURL;

    if (householdId) {
      const photoPath = `nine-lives/households/${householdId}/cats/${cat.id}/photo`;

      if (photoUpload.file) {
        photoURL = await uploadFile(photoPath, photoUpload.file);
      } else if (photoRemoved) {
        await deleteFile(photoPath);
        photoURL = null;
      }
    }

    await onSubmit({ ...nextCat, photoURL });
  };

  return (
    <>
      <div className='mb-4 flex flex-col items-center gap-2'>
        <Avatar
          src={photoUpload.previewUrl ?? undefined}
          alt={cat.name}
          initials={photoUpload.previewUrl ? undefined : getInitials(cat.name)}
          size='2xl'
          shape='circle'
        />
        <h2 className='text-lg font-semibold'>{cat.name}</h2>
        <ImageUploadField
          previewUrl={photoUpload.previewUrl}
          error={photoUpload.error}
          disabled={isSubmitting}
          hideAvatar
          onSelect={photoUpload.pick}
          onRemove={photoUpload.clear}
        />
      </div>

      <Tabs defaultValue='details' tabsWidth='full' variant='pills'>
        <TabsList>
          <TabsTrigger value='details'>Details</TabsTrigger>
          <TabsTrigger value='vaccinations' disabled={!householdId}>
            Vaccinations
          </TabsTrigger>
          <TabsTrigger value='weight' disabled={!householdId}>
            Weight history
          </TabsTrigger>
          <TabsTrigger value='conditions' disabled={!householdId}>
            Conditions
          </TabsTrigger>
          <TabsTrigger value='symptoms' disabled={!householdId}>
            Symptoms
          </TabsTrigger>
          <TabsTrigger value='records' disabled={!householdId}>
            Records
          </TabsTrigger>
        </TabsList>

        <TabsContent value='details' className='pt-4'>
          <CatProfileForm
            cat={cat}
            householdId={householdId}
            isSubmitting={isSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={onClose}
            onDelete={onDelete}
          />
        </TabsContent>

        {householdId && (
          <>
            <TabsContent value='vaccinations' className='pt-4'>
              <VaccinationsSection
                householdId={householdId}
                catId={cat.id}
                catName={cat.name}
              />
            </TabsContent>

            <TabsContent value='weight' className='pt-4'>
              <WeightEntriesSection
                householdId={householdId}
                catId={cat.id}
                catName={cat.name}
              />
            </TabsContent>

            <TabsContent value='conditions' className='pt-4'>
              <CatConditionsSection
                householdId={householdId}
                catId={cat.id}
                catName={cat.name}
              />
            </TabsContent>

            <TabsContent value='symptoms' className='pt-4'>
              <SymptomsSection
                householdId={householdId}
                catId={cat.id}
                catName={cat.name}
              />
            </TabsContent>

            <TabsContent value='records' className='pt-4'>
              <HealthRecordsSection
                householdId={householdId}
                catId={cat.id}
                catName={cat.name}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </>
  );
}

export default CatDetailsModal;
