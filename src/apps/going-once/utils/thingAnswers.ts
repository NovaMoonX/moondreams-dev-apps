import type { LinkPreview } from '@/lib/linkMetadata/types';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import type { ItemFields } from '@apps/going-once/store/actions/itemActions';
import type { Item, ItemCondition } from '@apps/going-once/types';

/** What the person has typed about a thing, as the fields show it; `toFields` turns it into what is stored. */
export interface ThingAnswers {
  title: string;
  price: string;
  isFree: boolean;
  floor: string;
  isFloorShown: boolean;
  condition: ItemCondition | null;
  description: string;
  brandModel: string;
  size: string;
  original: string;
  showOriginalPrice: boolean;
  boughtFrom: string;
  boughtOn: string;
  boughtUrl: string;
  boughtUrlPreview: LinkPreview | null;
  showBoughtUrl: boolean;
  notes: string;
}

export type ThingFields = Required<ItemFields>;

export const EMPTY_ANSWERS: ThingAnswers = {
  title: '',
  price: '',
  isFree: false,
  floor: '',
  isFloorShown: false,
  condition: null,
  description: '',
  brandModel: '',
  size: '',
  original: '',
  showOriginalPrice: false,
  boughtFrom: '',
  boughtOn: '',
  boughtUrl: '',
  boughtUrlPreview: null,
  showBoughtUrl: false,
  notes: '',
};

const toText = (value: string) => value.trim() || null;

export const toAnswers = (item: Item): ThingAnswers => ({
  title: item.title,
  price:
    item.askingPriceCents === null || item.askingPriceCents === 0
      ? ''
      : centsToInputValue(item.askingPriceCents),
  isFree: item.askingPriceCents === 0,
  floor: centsToInputValue(item.floorPriceCents),
  isFloorShown: item.floorPriceCents !== null,
  condition: item.condition,
  description: item.description ?? '',
  brandModel: item.brandModel ?? '',
  size: item.size ?? '',
  original: centsToInputValue(item.originalPriceCents),
  showOriginalPrice: item.showOriginalPrice,
  boughtFrom: item.boughtFrom ?? '',
  boughtOn: toDateInputValue(item.boughtOn ?? undefined),
  boughtUrl: item.boughtUrl ?? '',
  boughtUrlPreview: item.boughtUrlPreview,
  showBoughtUrl: item.showBoughtUrl,
  notes: item.notes ?? '',
});

export const toFields = (answers: ThingAnswers): ThingFields => {
  const boughtUrl = toText(answers.boughtUrl);
  const originalCents = parseMoneyToCents(answers.original);
  const originalPriceCents = originalCents === 0 ? null : originalCents;
  return {
    title: answers.title.trim(),
    condition: answers.condition,
    askingPriceCents: answers.isFree ? 0 : parseMoneyToCents(answers.price),
    floorPriceCents:
      answers.isFree || !answers.isFloorShown
        ? null
        : parseMoneyToCents(answers.floor),
    description: toText(answers.description),
    brandModel: toText(answers.brandModel),
    size: toText(answers.size),
    originalPriceCents,
    showOriginalPrice: originalPriceCents !== null && answers.showOriginalPrice,
    boughtFrom: toText(answers.boughtFrom),
    boughtOn: fromDateInputValue(answers.boughtOn) ?? null,
    boughtUrl,
    boughtUrlPreview: boughtUrl === null ? null : answers.boughtUrlPreview,
    showBoughtUrl: boughtUrl !== null && answers.showBoughtUrl,
    notes: toText(answers.notes),
  };
};

export const EMPTY_FIELDS: ThingFields = {
  title: '',
  condition: null,
  askingPriceCents: null,
  floorPriceCents: null,
  description: null,
  brandModel: null,
  size: null,
  originalPriceCents: null,
  showOriginalPrice: false,
  boughtFrom: null,
  boughtOn: null,
  boughtUrl: null,
  boughtUrlPreview: null,
  showBoughtUrl: false,
  notes: null,
};

const isSameValue = (saved: unknown, next: unknown) => {
  if (
    typeof saved === 'object' &&
    saved !== null &&
    typeof next === 'object' &&
    next !== null
  )
    return Object.keys({ ...saved, ...next }).every(
      (key) =>
        (saved as Record<string, unknown>)[key] ===
        (next as Record<string, unknown>)[key],
    );
  return saved === next;
};

/** The stored fields that differ from `saved`, so a save writes only what the person changed. */
export const diffFields = (saved: ThingFields, next: ThingFields): ItemFields =>
  Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => !isSameValue(saved[key as keyof ThingFields], value),
    ),
  ) as ItemFields;
