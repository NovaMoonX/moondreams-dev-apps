import { useState, type FormEvent } from 'react';

import { Button, Checkbox, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import RevealChip from '@/components/RevealChip';
import SectionDivider from '@/components/SectionDivider';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import {
  centsToInputValue,
  formatCentsShort,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import ThingThumb from '@apps/going-once/components/things/ThingThumb';
import {
  MAX_BUNDLE_NAME_LENGTH,
  MAX_BUNDLE_THINGS,
  MIN_BUNDLE_THINGS,
} from '@apps/going-once/constants';
import {
  createBundle,
  editBundle,
} from '@apps/going-once/store/actions/bundleActions';
import { selectItemsById, selectItems } from '@apps/going-once/store/selectors';
import type { Bundle, Item } from '@apps/going-once/types';
import { formatSeparatelyLine } from '@apps/going-once/utils/bundleWords';
import { getBundleParts } from '@apps/going-once/utils/bundles';
import { getItemName, isListable } from '@apps/going-once/utils/listing';

interface BundleFormSheetProps {
  saleId: string;
  uid: string;
  /** The bundle being changed; `null` while making a new one. */
  bundle: Bundle | null;
  /** The things a new bundle starts with. */
  startItemIds: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}

const sumAsking = (items: Item[]) =>
  items.reduce((total, item) => total + (item.askingPriceCents ?? 0), 0);

/** Making a bundle, or changing an active one: a name, its price against buying the things separately, and which things are only sold with it. */
function BundleFormSheet({
  saleId,
  uid,
  bundle,
  startItemIds,
  onClose,
  onSaved,
}: BundleFormSheetProps) {
  const itemsById = useAppSelector((state) => selectItemsById(state, saleId));
  const items = useAppSelector((state) => selectItems(state, saleId));
  const gone = bundle === null ? [] : getBundleParts(bundle, itemsById).gone;
  const initialIds =
    bundle === null
      ? startItemIds
      : getBundleParts(bundle, itemsById).deal.map((item) => item.id);
  const initialPrice = centsToInputValue(
    bundle === null
      ? sumAsking(initialIds.flatMap((id) => itemsById[id] ?? []))
      : bundle.priceCents,
  );
  const initialOnly =
    bundle === null
      ? []
      : initialIds.filter((id) => itemsById[id]?.isBundleOnly === true);

  const [name, setName] = useState(bundle?.name ?? '');
  const [price, setPrice] = useState(initialPrice);
  const [itemIds, setItemIds] = useState(initialIds);
  const [onlyIds, setOnlyIds] = useState<string[]>(initialOnly);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const things = itemIds.flatMap((id) => itemsById[id] ?? []);
  const priceCents = parseMoneyToCents(price);
  const separateCents = sumAsking(things);
  const floorCents = things.reduce(
    (total, item) => total + (item.floorPriceCents ?? 0),
    0,
  );
  const hasFloor = things.some((item) => item.floorPriceCents !== null);
  const isUnderFloor =
    hasFloor && priceCents !== null && priceCents < floorCents;
  const canAdd =
    bundle !== null && itemIds.length < MAX_BUNDLE_THINGS
      ? items.filter(
          (item) =>
            item.status === 'AVAILABLE' &&
            item.bundleId === null &&
            isListable(item) &&
            !itemIds.includes(item.id),
        )
      : [];
  const isDirty =
    name !== (bundle?.name ?? '') ||
    price !== initialPrice ||
    itemIds.join() !== initialIds.join() ||
    onlyIds.slice().sort().join() !== initialOnly.slice().sort().join();
  const requestClose = useDiscardGuard({
    isDirty,
    isBusy: isSaving,
    onClose,
  });
  const getNote = () => {
    if (name.trim() === '') return 'Give the bundle a name';
    if (priceCents === null) return 'Enter the bundle price';
    if (itemIds.length < MIN_BUNDLE_THINGS)
      return `A bundle needs at least ${MIN_BUNDLE_THINGS} things`;
    if (priceCents > separateCents)
      return `Keep it at or under ${formatCentsShort(separateCents)}, what they cost separately`;
    return null;
  };
  const note = getNote();

  const isAllOnly = itemIds.every((id) => onlyIds.includes(id));
  const toggleOnly = (id: string, isOnly: boolean) =>
    setOnlyIds((current) =>
      isOnly ? [...current, id] : current.filter((other) => other !== id),
    );
  const remove = (id: string) => {
    setItemIds((current) => current.filter((other) => other !== id));
    setOnlyIds((current) => current.filter((other) => other !== id));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (note !== null || priceCents === null || isSaving) return;
    setIsSaving(true);
    setError(null);
    const draft = {
      name: name.trim(),
      priceCents,
      itemIds: [...itemIds, ...gone.map((item) => item.id)],
      bundleOnlyIds: [
        ...onlyIds.filter((id) => itemIds.includes(id)),
        ...gone.filter((item) => item.isBundleOnly).map((item) => item.id),
      ],
    };
    const result = await (
      bundle === null
        ? createBundle(saleId, uid, draft)
        : editBundle(saleId, bundle.id, uid, draft)
    ).catch(() => null);
    if (result === null) {
      setIsSaving(false);
      setError(
        "We couldn't save the bundle. Check your connection and try again.",
      );
      return;
    }
    if (result.ok) {
      onSaved(result.id);
      return;
    }
    setIsSaving(false);
    setError(result.message);
  };

  return (
    <FormSheet
      isOpen
      onClose={() => void requestClose()}
      title={bundle === null ? 'Group into a bundle' : 'Change bundle'}
    >
      <form
        className='space-y-4'
        onSubmit={(event) => void handleSubmit(event)}
      >
        <Field label='Name'>
          {() => (
            <Input
              variant='outline'
              placeholder='Cat stuff'
              maxLength={MAX_BUNDLE_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className='space-y-2'>
          <Field label='Bundle price'>
            {() => (
              <MoneyInput
                variant='outline'
                value={price}
                onChange={setPrice}
                ariaLabel='Bundle price'
              />
            )}
          </Field>
          {priceCents !== null && (
            <p className='text-muted-foreground text-sm text-pretty'>
              {formatSeparatelyLine(priceCents, separateCents)}
            </p>
          )}
          {isUnderFloor && (
            <p className='text-muted-foreground text-sm text-pretty'>
              🔒 Under your floor prices added up (
              {formatCentsShort(floorCents)})
            </p>
          )}
        </div>
        <SectionDivider
          label={`Things · ${itemIds.length}`}
          trailing={
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className="text-primary relative h-7 px-2 text-sm after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
              onClick={() => setOnlyIds(isAllOnly ? [] : itemIds)}
            >
              {isAllOnly ? 'Clear bundle-only' : 'Make all bundle-only'}
            </Button>
          }
        />
        <ul className='space-y-2'>
          {things.map((item) => (
            <li
              key={item.id}
              className='border-border bg-card flex items-center gap-3 rounded-2xl border px-3 py-2.5'
            >
              <ThingThumb item={item} className='size-10' />
              <div className='min-w-0 flex-1 space-y-1'>
                <p className='line-clamp-2 font-medium break-words'>
                  {getItemName(item)}
                </p>
                <label className='text-muted-foreground flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={onlyIds.includes(item.id)}
                    onCheckedChange={(next) => toggleOnly(item.id, next)}
                  />
                  <span className='max-sm:hidden'>
                    Only sold with the bundle
                  </span>
                  <span className='sm:hidden'>Bundle only</span>
                </label>
              </div>
              {item.askingPriceCents !== null && (
                <PriceTag askingPriceCents={item.askingPriceCents} />
              )}
              {bundle !== null && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  rounded='full'
                  aria-label={`Remove ${getItemName(item)}`}
                  className="text-muted-foreground! relative size-8 min-w-8 p-0 before:absolute before:-inset-1 before:content-['']"
                  onClick={() => remove(item.id)}
                >
                  <X className='size-4' aria-hidden='true' />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {bundle !== null && canAdd.length > 0 && !isAdding && (
          <RevealChip
            icon={<Plus className='size-4' aria-hidden='true' />}
            onClick={() => setIsAdding(true)}
          >
            Add things
          </RevealChip>
        )}
        {isAdding && (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm'>
              Tap a thing to add it
            </p>
            {canAdd.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                Nothing else is free to add right now.
              </p>
            )}
            <ul className='space-y-2'>
              {canAdd.map((item) => (
                <li key={item.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='border-border h-auto min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left'
                    onClick={() =>
                      setItemIds((current) => [...current, item.id])
                    }
                  >
                    <ThingThumb item={item} className='size-10' />
                    <span className='text-foreground line-clamp-2 min-w-0 flex-1 text-base font-medium break-words'>
                      {getItemName(item)}
                    </span>
                    <Plus className='size-4 shrink-0' aria-hidden='true' />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error !== null && (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        )}
        <ModalFooterActions
          note={note}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              onClick={() => void requestClose()}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='submit'
              rounded='full'
              loading={isSaving}
              disabled={note !== null}
            >
              {bundle === null ? 'Make bundle' : 'Save'}
            </Button>
          }
        />
      </form>
    </FormSheet>
  );
}

export default BundleFormSheet;
