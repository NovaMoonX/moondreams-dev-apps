import { hkdfSync } from 'node:crypto';

import { gcmDecrypt, gcmEncrypt, type Keyring } from '../planKey.js';
import type { ProviderGrant } from './provider.js';

const GRANT_INFO = 'runway-provider-grant';

/** What is stored at `apps/runway/server/{uid}/grants/{linkId}`; no client rule can read it. */
export interface ProviderGrantDoc {
  linkId: string;
  providerItemId: string;
  cursor: string | null;
  masterKeyId: string;
  wrapped: string;
  nonce: string;
  createdAt: number;
}

export const grantsPath = (uid: string) => `apps/runway/server/${uid}/grants`;

/** Finds whose link an item belongs to when the provider's webhook names only the item. Server-only, like the grants. */
export interface ItemIndexDoc {
  uid: string;
  linkId: string;
}

export const ITEM_INDEX_PATH = 'apps/runway/server/_items/items';

export const itemIndexPath = (providerItemId: string) =>
  `${ITEM_INDEX_PATH}/${providerItemId}`;

const grantKey = (keyring: Keyring, masterKeyId: string) => {
  if (!Object.hasOwn(keyring.keys, masterKeyId)) {
    throw new Error('The master key this grant was sealed with is missing.');
  }
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(keyring.keys[masterKeyId], 'hex'),
      Buffer.alloc(0),
      GRANT_INFO,
      32,
    ),
  );
};

const aadFor = (uid: string, linkId: string) => Buffer.from(`${uid}:${linkId}`);

export function sealGrant(
  keyring: Keyring,
  uid: string,
  linkId: string,
  grant: ProviderGrant,
  now: number,
): ProviderGrantDoc {
  const { ciphertext, nonce } = gcmEncrypt(
    grantKey(keyring, keyring.current),
    Buffer.from(JSON.stringify({ credential: grant.credential })),
    aadFor(uid, linkId),
  );
  const result: ProviderGrantDoc = {
    linkId,
    providerItemId: grant.providerItemId,
    cursor: null,
    masterKeyId: keyring.current,
    wrapped: ciphertext,
    nonce,
    createdAt: now,
  };
  return result;
}

/** Throws when the master key is missing or the document no longer opens. */
export function openGrant(
  keyring: Keyring,
  uid: string,
  doc: ProviderGrantDoc,
): ProviderGrant {
  const plain = gcmDecrypt(
    grantKey(keyring, doc.masterKeyId),
    doc.wrapped,
    doc.nonce,
    aadFor(uid, doc.linkId),
  );
  const parsed = JSON.parse(plain.toString('utf8')) as { credential: string };
  const result: ProviderGrant = {
    credential: parsed.credential,
    providerItemId: doc.providerItemId,
  };
  return result;
}
