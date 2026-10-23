import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';

import type { STANCES } from '@apps/runway/constants';

export type RunwayTab = 'home' | 'days' | 'plan';

export type Stance = (typeof STANCES)[number];

/** Ciphertext of a JSON object, the shape `@lib/security` produces. */
export type Sealed = EncryptedFieldPayload;

export type RunwayEncryption = AppEncryption<'runway'>;

export interface PlanSealedFields {
  currencyCode: string;
}

export interface PlanDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
  keyId: string | null;
  sealed: Sealed | null;
}

export interface OpenPlan extends PlanSealedFields {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
  keyId: string | null;
}
