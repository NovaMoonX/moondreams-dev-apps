import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormScreen from '@/components/FormScreen';
import FormSheet from '@/components/FormSheet';
import PhotoSetPicker from '@/components/forms/PhotoSetPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SummaryRow from '@/components/SummaryRow';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
const PRIVATE: RowKey[] = ['floor', 'original', 'bought', 'link', 'notes'];

const SAVE_FAILED = "That didn't save. Check your connection and try again.";
/** An offline write never settles, so after this long it counts as kept on the phone and the sheet closes. */
const QUEUED_AFTER_MS = 2000;

interface RowSheetProps {
  rowKey: RowKey;
  item: Item;
  uid: string;
  onWritten: () => void;
  onSaveFailedLater: () => void;
  onClose: () => void;
}

/** One question in its own sheet: what is changed is written, field by field, when the sheet is done. */
function RowSheet({
  rowKey,
  item,
  uid,
  onWritten,
  onSaveFailedLater,
  onClose,
}: RowSheetProps) {
  const { label, fields, Question } = THING_ROWS[rowKey];
  const { addToast } = useToast();
  const [base] = useState(() => toFields(toAnswers(item)));
  const [draft, setDraft] = useState(() => ({
    ...toAnswers(item),
    ...(rowKey === 'floor' && { isFloorShown: true }),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    if (isSaving) return;
    const changed = diffFields(base, toFields(draft));
    const mine = Object.fromEntries(
      Object.entries(changed).filter(([key]) =>
        fields.some((field) => field === key),
      ),
    );
    if (Object.keys(mine).length === 0) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    const write = updateItemFields(
      item.saleId,
      item.id,
      uid,
      mine,
      // Finishing a draft that lacked a photo, name or price lists it once the last one lands; a complete draft kept on purpose stays one.
      item.isDraft &&
        (item.photos.length === 0 ||
          item.title.trim() === '' ||
          item.askingPriceCents === null),
    );
    const outcome = await Promise.race([
      write.then(
        () => 'saved' as const,
        () => 'failed' as const,
      ),
      new Promise<'queued'>((resolve) =>
        window.setTimeout(() => resolve('queued'), QUEUED_AFTER_MS),
      ),
    ]);
    if (outcome === 'failed') {
      setIsSaving(false);
      setError(SAVE_FAILED);
      return;
    }
    if (outcome === 'queued')
      write.catch(() => {
        addToast({
          title: `${label} didn't save`,
          description: 'Open it in Modify and try again.',
          type: 'error',
        });
        onSaveFailedLater();
      });
    onWritten();
    onClose();
  };

  return (
    <FormSheet isOpen onClose={() => void done()} title={label}>
      <div className='space-y-4 pb-4'>
        <Question
          answers={draft}
          onChange={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
        />
      </div>
      <ModalFooterActions
        note={error}
        rightActions={
          <Button type='button' disabled={isSaving} onClick={() => void done()}>
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
          <Button type='button' variant='secondary' onClick={onClose}>
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
  // Phones draw Modify as a subview that has its own entry; the desktop modal gets one here so Back returns to the drawer.
  const isPhone = useMediaQuery().isBelow('sm');
  const { dialogId, onDialogClose } = useSheetHistory(!isPhone, onClose);
  const canDelete = canDeleteItem(item, { isSeller, uid, now });
  const [openKey, setOpenKey] = useState<RowKey | 'photos' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const { deleteThing, dialog: deleteDialog } = useDeleteThing(
    item.saleId,
    uid,
  );
  const answers = toAnswers(item);

  const renderRow = (key: RowKey) => {
    const { label, summary } = THING_ROWS[key];
    const text = summary(answers);
    const sheetKey = key === 'showOriginal' ? 'original' : key;
    return (
      <SummaryRow key={key} label={label} onClick={() => setOpenKey(sheetKey)}>
        {text === '' ? (
          <span className='text-muted-foreground'>Not set</span>
        ) : (
          <span className='line-clamp-2'>{text}</span>
        )}
      </SummaryRow>
    );
  };

  return (
    <FormScreen
      isOpen
      onClose={onDialogClose}
      title={getItemName(item)}
      backLabel={`Back to ${getItemName(item)}`}
    >
      <div id={dialogId} className='space-y-5'>
        <div className='space-y-2'>
          <SectionDivider label='Buyers see' />
          <SummaryRow label='Photos' onClick={() => setOpenKey('photos')}>
            {item.photos.length === 0
              ? 'Add photos'
              : `${item.photos.length} ${item.photos.length === 1 ? 'photo' : 'photos'}`}
          </SummaryRow>
          {[...BUYERS_SEE, ...(item.showBoughtUrl ? ['link' as const] : [])]
            .filter(
              (key) =>
                key !== 'showOriginal' || item.originalPriceCents !== null,
            )
            .map(renderRow)}
        </div>
        <div className='space-y-2'>
          <SectionDivider label='🔒 Only you and your co-sellers' />
          {PRIVATE.filter(
            (key) =>
              (key !== 'floor' || item.askingPriceCents !== 0) &&
              (key !== 'link' || !item.showBoughtUrl),
          ).map(renderRow)}
        </div>
        <ModalFooterActions
          note={saveError ?? (hasSaved ? 'Saved' : null)}
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
            <Button type='button' onClick={onClose}>
              Done
            </Button>
          }
        />
      </div>
      {deleteDialog}
      {openKey === 'photos' && (
        <PhotosSheet item={item} uid={uid} onClose={() => setOpenKey(null)} />
      )}
      {openKey !== null && openKey !== 'photos' && (
        <RowSheet
          key={openKey}
          rowKey={openKey}
          item={item}
          uid={uid}
          onWritten={() => {
            setHasSaved(true);
            setSaveError(null);
          }}
          onSaveFailedLater={() => setHasSaved(false)}
          onClose={() => setOpenKey(null)}
        />
      )}
    </FormScreen>
  );
}

export default ThingForm;
