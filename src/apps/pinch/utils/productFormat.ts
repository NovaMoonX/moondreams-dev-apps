import { formatCents } from '@/utils/moneyUtils';
import {
  UNIT_DIMENSION,
  UNIT_LABELS,
  UNIT_TO_BASE,
} from '@apps/pinch/constants';
import type { Product, Unit } from '@apps/pinch/types';
import { bridge, toBase, type Conversions } from '@apps/pinch/utils/quantity';
import { getUnitCost } from '@apps/pinch/utils/unitCost';

const roundAmount = (value: number) => Math.round(value * 100) / 100;

type PriceAndSize = Pick<Product, 'priceCents' | 'sizeAmount' | 'sizeUnit'>;

/** "3 lb": a package size as people say it. */
export const formatSize = (amount: number, unit: Product['sizeUnit']) =>
  `${roundAmount(amount)} ${UNIT_LABELS[unit]}`;

/** "$9.48 / 3 lb". */
export const formatPriceAndSize = (product: Product) =>
  `${formatCents(product.priceCents)} / ${formatSize(product.sizeAmount, product.sizeUnit)}`;

/** What a unit price is said per, from the unit a package is sold in: a lb for lb, 100 g for g, a fl oz for spoons and cups. */
const PRICE_PER: Record<Unit, { unit: Unit; amount: number }> = {
  G: { unit: 'G', amount: 100 },
  KG: { unit: 'KG', amount: 1 },
  OZ: { unit: 'OZ', amount: 1 },
  LB: { unit: 'LB', amount: 1 },
  ML: { unit: 'ML', amount: 100 },
  L: { unit: 'L', amount: 1 },
  TSP: { unit: 'FL_OZ', amount: 1 },
  TBSP: { unit: 'FL_OZ', amount: 1 },
  CUP: { unit: 'FL_OZ', amount: 1 },
  FL_OZ: { unit: 'FL_OZ', amount: 1 },
  PINCH: { unit: 'FL_OZ', amount: 1 },
  EACH: { unit: 'EACH', amount: 1 },
};

/** "$3.08 / lb", "$0.69 / 100 g", "$0.42 each": a package's price per unit, said in `sameAs`'s unit when it measures the same way (so two places for one ingredient compare), and null when the package is exactly one of that unit and its price already says it. */
export function formatUnitPrice(
  product: PriceAndSize,
  sameAs: Unit = product.sizeUnit,
): string | null {
  const per =
    PRICE_PER[
      UNIT_DIMENSION[sameAs] === UNIT_DIMENSION[product.sizeUnit]
        ? sameAs
        : product.sizeUnit
    ];
  const sizeBase = toBase(product.sizeAmount, product.sizeUnit).value;
  const perBase = per.amount * UNIT_TO_BASE[per.unit];
  if (sizeBase <= 0 || Math.abs(sizeBase - perBase) < perBase * 1e-6) {
    return null;
  }

  const price = formatCents((product.priceCents * perBase) / sizeBase);
  const result =
    per.unit === 'EACH'
      ? `${price} each`
      : `${price} / ${per.amount === 1 ? '' : `${per.amount} `}${UNIT_LABELS[per.unit]}`;
  return result;
}

/** "That's about $0.66 each in your recipes": a price read back in the unit the recipes measure the ingredient in (per 100 g or ml), with the same math a recipe's cost uses; null when that unit can't be compared with the package. */
export function formatRecipeUnitEcho(
  product: PriceAndSize,
  recipeUnit: Unit,
  conversions: Conversions,
): string | null {
  const amount = recipeUnit === 'G' || recipeUnit === 'ML' ? 100 : 1;
  const unitCost = getUnitCost(product);
  const quantity = bridge(
    toBase(amount, recipeUnit),
    unitCost.dimension,
    conversions,
  );
  if (!quantity || !Number.isFinite(unitCost.centsPerBase)) {
    return null;
  }

  const cents = quantity.value * unitCost.centsPerBase;
  const per =
    recipeUnit === 'EACH'
      ? 'each'
      : `per ${amount === 1 ? '' : `${amount} `}${UNIT_LABELS[recipeUnit]}`;
  const result =
    cents < 0.5
      ? `That's less than ${formatCents(1)} ${per} in your recipes.`
      : `That's about ${formatCents(cents)} ${per} in your recipes.`;
  return result;
}
