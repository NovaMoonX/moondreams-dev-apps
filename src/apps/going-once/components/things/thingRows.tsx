import type { ComponentType } from 'react';

import { formatDateUTC } from '@/utils/formatUtils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getWebLinkHost } from '@/utils/urlUtils';
import { formatCentsShort, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  BoughtQuestion,
  BrandQuestion,
  ConditionQuestion,
  DescriptionQuestion,
  FloorField,
  NameQuestion,
  NotesQuestion,
  OriginalPriceQuestion,
  PriceQuestion,
  SizeQuestion,
  StoreLinkQuestion,
  type QuestionProps,
} from '@apps/going-once/components/things/ThingQuestions';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { formatAskingPrice } from '@apps/going-once/utils/listing';
import {
  toFields,
  type ThingAnswers,
  type ThingFields,
} from '@apps/going-once/utils/thingAnswers';

export type RowKey =
  | 'name'
  | 'price'
  | 'condition'
  | 'description'
  | 'brand'
  | 'size'
  | 'showOriginal'
  | 'floor'
  | 'original'
  | 'bought'
  | 'link'
  | 'notes';

export type ExtraKey = Extract<
  RowKey,
  'description' | 'brand' | 'size' | 'original' | 'bought' | 'link' | 'notes'
>;

export interface ThingRow {
  label: string;
  icon: string;
  /** The stored fields this row's sheet may write, and no others. */
  fields: (keyof ThingFields)[];
  /** Fields of another row its question may fill in on the way (a pasted store link names the store). */
  alsoFills?: (keyof ThingFields)[];
  /** The text its row shows, or '' while nothing is filled in. */
  summary: (answers: ThingAnswers) => string;
  Question: ComponentType<QuestionProps>;
}

const clip = (text: string) => text.trim();

export const THING_ROWS: Record<RowKey, ThingRow> = {
  name: {
    label: 'Name',
    icon: '🏷️',
    fields: ['title'],
    summary: (a) => clip(a.title),
    Question: NameQuestion,
  },
  price: {
    label: 'Price',
    icon: '💲',
    fields: ['askingPriceCents', 'floorPriceCents'],
    summary: (a) => formatAskingPrice(toFields(a).askingPriceCents) ?? '',
    Question: (props) => <PriceQuestion {...props} hasFloor={false} />,
  },
  condition: {
    label: 'Condition',
    icon: '✨',
    fields: ['condition'],
    summary: (a) => (a.condition === null ? '' : CONDITION_LABELS[a.condition]),
    Question: ConditionQuestion,
  },
  description: {
    label: 'Description',
    icon: '📝',
    fields: ['description'],
    summary: (a) => clip(a.description),
    Question: DescriptionQuestion,
  },
  brand: {
    label: 'Brand or model',
    icon: '🏭',
    fields: ['brandModel'],
    summary: (a) => clip(a.brandModel),
    Question: BrandQuestion,
  },
  size: {
    label: 'Size',
    icon: '📏',
    fields: ['size'],
    summary: (a) => clip(a.size),
    Question: SizeQuestion,
  },
  showOriginal: {
    label: 'Show original price',
    icon: '👀',
    fields: ['originalPriceCents', 'showOriginalPrice'],
    summary: (a) => {
      if (parseMoneyToCents(a.original) === null) return '';
      return a.showOriginalPrice ? 'Buyers see it' : 'Hidden from buyers';
    },
    Question: OriginalPriceQuestion,
  },
  floor: {
    label: '🔒 Floor price',
    icon: '🔒',
    fields: ['floorPriceCents'],
    summary: (a) => {
      const cents = toFields({ ...a, isFloorShown: true }).floorPriceCents;
      return cents === null ? '' : formatCentsShort(cents);
    },
    Question: (props) => <FloorField {...props} isTitled />,
  },
  original: {
    label: '🔒 Original price',
    icon: '🧾',
    fields: ['originalPriceCents', 'showOriginalPrice'],
    summary: (a) => {
      const cents = parseMoneyToCents(a.original);
      if (cents === null) return '';
      return a.showOriginalPrice
        ? `${formatCentsShort(cents)} · shown to buyers`
        : formatCentsShort(cents);
    },
    Question: OriginalPriceQuestion,
  },
  bought: {
    label: '🔒 Where you got it',
    icon: '🛍️',
    fields: ['boughtFrom', 'boughtOn'],
    alsoFills: ['boughtUrl', 'boughtUrlPreview'],
    summary: (a) => {
      const day = fromDateInputValue(a.boughtOn);
      const store = clip(a.boughtFrom);
      return [store, day === undefined ? '' : formatDateUTC(day)]
        .filter((part) => part !== '')
        .join(' · ');
    },
    Question: BoughtQuestion,
  },
  link: {
    label: 'Store link',
    icon: '🔗',
    fields: ['boughtUrl', 'boughtUrlPreview', 'showBoughtUrl'],
    alsoFills: ['boughtFrom'],
    summary: (a) => {
      if (a.boughtUrl === '') return '';
      const site =
        a.boughtUrlPreview?.siteName ||
        getWebLinkHost(a.boughtUrl) ||
        'Store link';
      return a.showBoughtUrl ? `${site} · shown to buyers` : site;
    },
    Question: StoreLinkQuestion,
  },
  notes: {
    label: '🔒 Notes',
    icon: '🗒️',
    fields: ['notes'],
    summary: (a) => clip(a.notes),
    Question: NotesQuestion,
  },
};

export const EXTRA_KEYS: ExtraKey[] = [
  'description',
  'brand',
  'size',
  'original',
  'bought',
  'link',
  'notes',
];

/** The extras buyers can see, and the ones only the seller and co-sellers see; the walk-through's review draws them as two sections. */
export const BUYER_EXTRA_KEYS: ExtraKey[] = ['description', 'brand', 'size'];
export const PRIVATE_EXTRA_KEYS: ExtraKey[] = [
  'original',
  'bought',
  'link',
  'notes',
];

/** The label without its lock, for places that draw the lock themselves. */
export const getRowTitle = (key: RowKey) =>
  THING_ROWS[key].label.replace('🔒 ', '');

/** The answers each extra owns, cleared when the extra is removed. */
export const EXTRA_ANSWER_KEYS: Record<ExtraKey, (keyof ThingAnswers)[]> = {
  description: ['description'],
  brand: ['brandModel'],
  size: ['size'],
  original: ['original', 'showOriginalPrice'],
  bought: ['boughtFrom', 'boughtOn'],
  link: ['boughtUrl', 'boughtUrlPreview', 'showBoughtUrl'],
  notes: ['notes'],
};
