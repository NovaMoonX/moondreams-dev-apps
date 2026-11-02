import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export const saleRef = (saleId: string) =>
  getFirestore().doc(`apps/going-once/sales/${saleId}`);

export const linkRef = (linkId: string) =>
  getFirestore().doc(`apps/going-once/publicLinks/${linkId}`);

/** The folder of a link's public photo copies. */
export const publicFolder = (linkId: string) =>
  `apps/going-once/public/${linkId}/`;
