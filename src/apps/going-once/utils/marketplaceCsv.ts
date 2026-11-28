import type { CsvCell } from '@/utils/csvUtils';
import type { Bundle, Item, ItemCondition } from '@apps/going-once/types';
import { getBundleParts, isSoloLocked } from '@apps/going-once/utils/bundles';
import {
  formatShownOriginalPrice,
  getItemName,
  getListingDetailLines,
  isListable,
} from '@apps/going-once/utils/listing';

/** Facebook takes this many listings per bulk upload file. */
export const MARKETPLACE_ROWS_PER_FILE = 50;
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;

/** The conditions Facebook's bulk upload accepts; "Well used" has no closer match than Fair. */
const MARKETPLACE_CONDITIONS: Record<ItemCondition, string> = {
  NEW: 'New',
  LIKE_NEW: 'Used - Like New',
  GOOD: 'Used - Good',
  FAIR: 'Used - Fair',
  WELL_USED: 'Used - Fair',
};

/** The first four rows of Facebook's Marketplace Bulk Upload Template, word for word; listings start on row 5. */
const TEMPLATE_HEAD: CsvCell[][] = [
  ['Facebook Marketplace Bulk Upload Template'],
  [
    'You can create up to 50 listings at once. When you are finished, be sure to save or export this as an XLS/XLSX file.',
  ],
  [
    'REQUIRED | Plain text (up to 150 characters',
    'REQUIRED | A whole number in $',
    'REQUIRED | Supported values: "New"; "Used - Like New"; "Used - Good"; "Used - Fair"',
    'OPTIONAL | Plain text (up to 5000 characters)',
    'OPTIONAL | Type of listing',
  ],
  ['TITLE', 'PRICE', 'CONDITION', 'DESCRIPTION', 'CATEGORY'],
];

/** The things a Marketplace upload holds: Available, listable and sellable on their own (never one held for its bundle). */
export function getMarketplaceThings(items: Item[], bundles: Bundle[]): Item[] {
  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const isBundleLocked = (item: Item) => {
    const bundle = bundles.find((found) => found.id === item.bundleId) ?? null;
    return (
      bundle !== null &&
      isSoloLocked(item, bundle, getBundleParts(bundle, itemsById).deal.length)
    );
  };
  return items.filter(
    (item) =>
      item.status === 'AVAILABLE' && isListable(item) && !isBundleLocked(item),
  );
}

/** The listing's description: brand or model, size and a shown original price, then the thing's own description. Only what buyers already see. */
function toDescription(item: Item): string {
  const lines = [
    ...getListingDetailLines(item),
    formatShownOriginalPrice(item) ?? '',
  ].filter((line) => line !== '');
  return [lines.join('\n'), item.description?.trim() ?? '']
    .filter((block) => block !== '')
    .join('\n\n')
    .slice(0, MAX_DESCRIPTION);
}

const toRow = (item: Item): CsvCell[] => [
  getItemName(item).slice(0, MAX_TITLE),
  Math.round((item.askingPriceCents ?? 0) / 100),
  item.condition === null ? null : MARKETPLACE_CONDITIONS[item.condition],
  toDescription(item),
  null,
];

/** The things in files of at most 50, each in Facebook's template layout. */
export function toMarketplaceSheets(things: Item[]): CsvCell[][][] {
  const fileCount = Math.ceil(things.length / MARKETPLACE_ROWS_PER_FILE);
  return Array.from({ length: fileCount }, (_, index) => [
    ...TEMPLATE_HEAD,
    ...things
      .slice(
        index * MARKETPLACE_ROWS_PER_FILE,
        (index + 1) * MARKETPLACE_ROWS_PER_FILE,
      )
      .map(toRow),
  ]);
}

/** "Garage sale - Marketplace.csv", or "… (2 of 3).csv" when split, with characters file systems refuse taken out. */
export function getMarketplaceFileName(
  saleName: string,
  index: number,
  count: number,
): string {
  const base = saleName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Sale';
  const part = count > 1 ? ` (${index + 1} of ${count})` : '';
  return `${base} - Marketplace${part}.csv`;
}
