const DB_NAME = 'device-secrets';
const STORE = 'secrets';
const IV_BYTES = 12;

type KeptSecret = {
  id: string;
  uid: string;
  wrappingKey: CryptoKey;
  nonce: Uint8Array;
  ciphertext: ArrayBuffer;
  checkedAt: number;
};

/** Whether this browser can keep a secret on the device: needs IndexedDB and Web Crypto (https only). */
export function canKeepDeviceSecrets(): boolean {
  return Boolean(globalThis.indexedDB && globalThis.crypto?.subtle);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

const toId = (uid: string, name: string) => `${uid}:${name}`;

// The wrapping key is non-extractable, so page code can use it but never read it out.
/** Keeps a secret string for one account on this device, sealed under a non-extractable key. */
export async function keepDeviceSecret(
  uid: string,
  name: string,
  value: string,
) {
  const wrappingKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    wrappingKey,
    new TextEncoder().encode(value),
  );
  const record: KeptSecret = {
    checkedAt: Date.now(),
    id: toId(uid, name),
    uid,
    wrappingKey,
    nonce,
    ciphertext,
  };
  await withStore('readwrite', (store) => store.put(record));
}

/** The secret kept for this account on this device, or `null` when none is kept, it no longer opens, or it went unchecked too long (then it is removed). */
export async function readDeviceSecret(
  uid: string,
  name: string,
  maxUncheckedMs = Infinity,
): Promise<string | null> {
  if (!canKeepDeviceSecrets()) return null;
  const record = await withStore<KeptSecret | undefined>('readonly', (store) =>
    store.get(toId(uid, name)),
  ).catch(() => undefined);
  if (!record) return null;
  if (!(Date.now() - record.checkedAt <= maxUncheckedMs)) {
    await forgetDeviceSecret(uid, name).catch(() => undefined);
    return null;
  }
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.nonce) },
      record.wrappingKey,
      record.ciphertext,
    );
    return new TextDecoder().decode(plain);
  } catch {
    await forgetDeviceSecret(uid, name).catch(() => undefined);
    return null;
  }
}

/** Records that the server just confirmed this kept secret, restarting its unchecked clock. */
export async function markDeviceSecretChecked(uid: string, name: string) {
  if (!canKeepDeviceSecrets()) return;
  const id = toId(uid, name);
  const record = await withStore<KeptSecret | undefined>('readonly', (store) =>
    store.get(id),
  );
  if (!record) return;
  await withStore('readwrite', (store) =>
    store.put({ ...record, checkedAt: Date.now() }),
  );
}

/** Removes one kept secret from this device. */
export async function forgetDeviceSecret(uid: string, name: string) {
  if (!canKeepDeviceSecrets()) return;
  await withStore('readwrite', (store) => store.delete(toId(uid, name)));
}

/** Removes every secret kept for this account on this device (on sign-out). */
export async function forgetDeviceSecretsFor(uid: string) {
  if (!canKeepDeviceSecrets()) return;
  await withStore('readwrite', (store) =>
    store.delete(IDBKeyRange.bound(`${uid}:`, `${uid}:￿`)),
  );
}
