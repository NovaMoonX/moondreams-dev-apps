import { formatCents } from '@/utils/moneyUtils';
import { UNIT_LABELS } from '@apps/pinch/constants';
import type { Product } from '@apps/pinch/types';

const roundAmount = (value: number) => Math.round(value * 100) / 100;

/** "3 lb": a package size as people say it. */
export const formatSize = (amount: number, unit: Product['sizeUnit']) => `${roundAmount(amount)} ${UNIT_LABELS[unit]}`;

/** "$9.48 / 3 lb". */
export const formatPriceAndSize = (product: Product) => `${formatCents(product.priceCents)} / ${formatSize(product.sizeAmount, product.sizeUnit)}`;
