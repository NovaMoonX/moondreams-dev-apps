import type { Dimension, Product } from '@apps/pinch/types';
import { toBase } from '@apps/pinch/utils/quantity';

export interface UnitCost {
  dimension: Dimension;
  /** Cents per gram, millilitre or piece, unrounded. */
  centsPerBase: number;
}

/** What one base unit of the product costs: its price over its package size. */
export function getUnitCost(
  product: Pick<Product, 'priceCents' | 'sizeAmount' | 'sizeUnit'>,
): UnitCost {
  const size = toBase(product.sizeAmount, product.sizeUnit);

  return {
    dimension: size.dimension,
    centsPerBase: product.priceCents / size.value,
  };
}
