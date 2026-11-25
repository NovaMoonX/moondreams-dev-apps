import { useRef, useState } from 'react';

import {
  Button,
  Input,
  Label,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';

import DeleteIconButton from '@/components/DeleteIconButton';
import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { PillGroup } from '@/components/PillGroup';
import {
  MAX_NAME_LENGTH,
  MAX_SHOPPING_NOTE_LENGTH,
  SHOP_SECTION_LABELS,
  SHOP_SECTIONS,
  type ShopSection,
} from '@apps/pinch/constants';
import {
  renameListOnlyItem,
  setListOnlySection,
  setShoppingItemNote,
} from '@apps/pinch/store/actions/shoppingActions';
import type { ShoppingItem } from '@apps/pinch/types';

const NOTE_MAX_LINES = 4;

interface ShoppingListOnlySheetProps {
  uid: string;
  item: ShoppingItem;
  onClose: () => void;
  /** Takes the line off at once; the list offers an Undo. */
  onRemove: () => void;
}

/** A line that is only on the list ("Paper towels"): its words and a note, with no amount or meals behind it. */
function ShoppingListOnlySheet({
  uid,
  item,
  onClose,
  onRemove,
}: ShoppingListOnlySheetProps) {
  const dispatch = useAppDispatch();
  const [savedName] = useState(() => item.freeText ?? '');
  const [savedNote] = useState(() => item.note ?? '');
  const [nameText, setNameText] = useState(savedName);
  const [noteText, setNoteText] = useState(savedNote);
  const [savedSection] = useState<ShopSection>(
    () => item.shopSection ?? 'other',
  );
  const [section, setSection] = useState<ShopSection>(savedSection);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(noteRef, noteText, NOTE_MAX_LINES);

  const name = nameText.trim();
  const note = noteText.trim();
  const isNameChanged = name !== savedName;
  const isNoteChanged = note !== savedNote.trim();
  const isSectionChanged = section !== savedSection;
  const canSave =
    name !== '' && (isNameChanged || isNoteChanged || isSectionChanged);
  const getNote = () => {
    if (name === '') return 'Give it a name to save.';
    return null;
  };

  const handleSubmit = async () => {
    if (!canSave || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await Promise.all([
        isNameChanged
          ? dispatch(
              renameListOnlyItem({ uid, id: item.id, text: name }),
            ).unwrap()
          : null,
        isNoteChanged
          ? dispatch(
              setShoppingItemNote({
                uid,
                ids: [item.id],
                note: note === '' ? null : note,
              }),
            ).unwrap()
          : null,
        isSectionChanged
          ? dispatch(
              setListOnlySection({
                uid,
                id: item.id,
                shopSection: section === 'other' ? null : section,
              }),
            ).unwrap()
          : null,
      ]);
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this change.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title={savedName}>
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <p className='text-muted-foreground text-sm'>
          Only on your list, so it stays out of your recipes, kitchen and
          prices.
        </p>
        <div className='space-y-1'>
          <Label
            htmlFor='pinch-list-only-name'
            className='text-muted-foreground text-xs'
          >
            Name
          </Label>
          <Input
            id='pinch-list-only-name'
            variant='outline'
            className={COMPACT_INPUT_CLASS}
            maxLength={MAX_NAME_LENGTH}
            value={nameText}
            onChange={(event) => setNameText(event.target.value)}
          />
        </div>
        <div className='space-y-1'>
          <p className='text-muted-foreground text-xs'>Part of the shop</p>
          <PillGroup
            label='Part of the shop'
            options={SHOP_SECTIONS.map((value) => ({
              value,
              label: SHOP_SECTION_LABELS[value],
            }))}
            value={section}
            onChange={setSection}
            isThin
          />
        </div>
        <div className='space-y-1'>
          <Label
            htmlFor='pinch-list-only-note'
            className='text-muted-foreground text-xs'
          >
            Note
          </Label>
          <Textarea
            id='pinch-list-only-note'
            ref={noteRef}
            rows={1}
            variant='outline'
            placeholder='how many, the brand you like…'
            maxLength={MAX_SHOPPING_NOTE_LENGTH}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
          />
        </div>
        <ModalFooterActions
          note={getNote()}
          leftActions={
            <DeleteIconButton
              label='Remove'
              onClick={onRemove}
              disabled={isSubmitting}
            />
          }
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='submit'
              loading={isSubmitting}
              disabled={isSubmitting || !canSave}
            >
              Save
            </Button>
          }
        />
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </form>
    </FormSheet>
  );
}

export default ShoppingListOnlySheet;
