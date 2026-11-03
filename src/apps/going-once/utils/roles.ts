import type { Sale } from '@apps/going-once/types';

/** The seller is the sale's owner; every seller-only control reads the role here. */
export const isSaleSeller = (
  sale: Pick<Sale, 'ownerUid'> | null,
  uid: string,
) => sale !== null && sale.ownerUid === uid;
