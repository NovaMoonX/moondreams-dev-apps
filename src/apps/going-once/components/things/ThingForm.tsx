import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormScreen from '@/components/FormScreen';
import FormSheet from '@/components/FormSheet';
import PhotoSetPicker from '@/components/forms/PhotoSetPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SummaryRow from '@/components/SummaryRow';
import { usePhotoSetUploads } from '@/hooks/usePhotoSetUploads';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import {
  THING_ROWS,
  type RowKey,
} from '@apps/going-once/components/things/thingRows';
import { MAX_ITEM_PHOTOS } from '@apps/going-once/constants';
import { useDeleteThing } from '@apps/going-once/hooks/useDeleteThing';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import {
  addItemPhoto,
  removeItemPhoto,
  reorderItemPhotos,
  updateItemFields,
} from '@apps/going-once/store/actions/itemActions';
import type { Item } from '@apps/going-once/types';
import { canDeleteItem, getItemName } from '@apps/going-once/utils/listing';
import {
  diffFields,
  toAnswers,
  toFields,
} from '@apps/going-once/utils/thingAnswers';

const BUYERS_SEE: RowKey[] = [
  'name',
  'price',
  'condition',
  'description',
  'brand',
  'size',
  'showOriginal',
];
const PRIVATE: RowKey[] = ['floor', 'original', 'bought', 'notes'];

const SAVE_FAILED =
  "That didn't save. Check your connection, then open it and try again.";

interface RowSheetProps {
  rowKey: RowKey;
  item: Item;
  uid: string;
  onSaved: () => void;
  onSaveError: () => void;
  onClose: () => void;
}

/** One question in its own sheet: what is changed is written, field by field, when the sheet is done. */
function RowSheet({
  rowKey,
  item,
  uid,
  onSaved,
  onSaveError,
  onClose,
}: RowSheetProps) {
  const { label, fields, Question } = THING_ROWS[rowKey];
  const [draft, setDraft] = useState(() => ({
    ...toAnswers(item),
    ...(rowKey === 'floor' && { isFloorShown: true }),
  }));

  const done = () => {
    const changed = diffFields(toFields(toAnswers(item)), toFields(draft));
    const mine = Object.fromEntries(
      Object.entries(changed).filter(([key]) =>
        fields.some((field) => field === key),
      ),
    );
    if (Object.keys(mine).length > 0)
      updateItemFields(item.saleId, item.id, uid, mine).then(
        onSaved,
        onSaveError,
      );
    onClose();
  };

  return (
    <FormSheet isOpen onClose={done} title={label}>
      <div className='space-y-4 pb-4'>
        <Question
          answers={draft}
          onChange={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
        />
      </div>
      <ModalFooterActions
        rightActions={
          <Button type='button' onClick={done}>
            Done
          </Button>
        }
      />
    </FormSheet>
  );
}

interface PhotosSheetProps {
  item: Item;
  uid: string;
  onClose: () => void;
}

function PhotosSheet({ item, uid, onClose }: PhotosSheetProps) {
  const dispatch = useAppDispatch();
  const { saleId, id: itemId } = item;
  const photoUrls = useItemPhotoUrls(item.photos);
  const uploads = usePhotoSetUploads(
    (file) => dispatch(addItemPhoto({ saleId, itemId, uid, file })).unwrap(),
    item.photos.map((photo) => photo.id),
  );

  return (
    <FormSheet isOpen onClose={onClose} title='Photos'>
      <div className='space-y-4 pb-4'>
        <p className='text-muted-foreground text-sm'>
          The first one is the cover. Changes here save at once.
        </p>
        <PhotoSetPicker
          photos={photoUrls}
          uploads={uploads}
          max={MAX_ITEM_PHOTOS}
          fullMessage={`That's ${MAX_ITEM_PHOTOS}, the most a thing can have.`}
          onReorder={(ids) => reorderItemPhotos(saleId, itemId, uid, ids)}
          onRemove={(photoId) => removeItemPhoto(saleId, itemId, uid, photoId)}
        />
      </div>
      <ModalFooterActions
        rightActions={
          <Button type='button' onClick={onClose}>
            Done
          </Button>
        }
      />
    </FormSheet>
  );
}

interface ThingFormProps {
  item: Item;
  uid: string;
  isSeller: boolean;
  onClose: () => void;
}

/** Modify: every answer about a thing as a summary row that opens its question in a sheet and saves on Done, in the two audiences' sections. */
function ThingForm({ item, uid, isSeller, onClose }: ThingFormProps) {
  const now = useNow();
  const canDelete = canDeleteItem(item, { isSeller, uid, now });
  const [openKey, setOpenKey] = useState<RowKey | 'photos' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const deleteThing = useDeleteThing(item.saleId);
  const answers = toAnswers(item);

  const renderRow = (key: RowKey) => {
    const { label, summary } = THING_ROWS[key];
    const text = summary(answers);
    return (
      <SummaryRow key={key} label={label} onClick={() => setOpenKey(key)}>
        {text === '' ? (
          <span className='text-muted-foreground'>Not set</span>
        ) : (
          <span className='line-clamp-2'>{text}</span>
        )}
      </SummaryRow>
    );
  };

  return (
    <FormScreen isOpen onClose={onClose} title={getItemName(item)}>
      <div className='space-y-5'>
        <div className='space-y-2'>
          <SectionDivider label='Buyers see' />
          <SummaryRow label='Photos' onClick={() => setOpenKey('photos')}>
            {item.photos.length === 0
              ? 'Add photos'
              : `${item.photos.length} ${item.photos.length === 1 ? 'photo' : 'photos'}`}
          </SummaryRow>
          {BUYERS_SEE.map(renderRow)}
        </div>
        <div className='space-y-2'>
          <SectionDivider label='🔒 Only you and your co-sellers' />
          {PRIVATE.filter(
            (key) => key !== 'floor' || item.askingPriceCents !== 0,
          ).map(renderRow)}
        </div>
        <ModalFooterActions
          note={saveError ?? 'Saved'}
          leftActions={
            canDelete && (
              <DeleteIconButton
                label='Delete thing'
                onClick={() => {
                  void deleteThing(item).then((isDeleted) => {
                    if (isDeleted) onClose();
                  });
                }}
              />
            )
          }
          rightActions={
            <Button type='button' variant='secondary' onClick={onClose}>
              Done
            </Button>
          }
        />
      </div>
      {openKey === 'photos' && (
        <PhotosSheet item={item} uid={uid} onClose={() => setOpenKey(null)} />
      )}
      {openKey !== null && openKey !== 'photos' && (
        <RowSheet
          key={openKey}
          rowKey={openKey}
          item={item}
          uid={uid}
          onSaved={() => setSaveError(null)}
          onSaveError={() => setSaveError(SAVE_FAILED)}
          onClose={() => setOpenKey(null)}
        />
      )}
    </FormScreen>
  );
}

export default ThingForm;
