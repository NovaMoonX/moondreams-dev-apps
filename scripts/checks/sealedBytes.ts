// Sealing a file's bytes: they open with the same key and nonce, and with nothing else.
import assert from 'node:assert/strict';

import {
  decryptBytes,
  encryptBytes,
} from '../../src/lib/security/encryption.ts';

const key = 'd953f53d9d6c3b3d2a748beca467f20b4b74d7cb7cc17a0e7a7f315f8b3e756f';
const otherKey = '0'.repeat(64);
const plain = Uint8Array.from({ length: 5000 }, (_, index) => index % 251);

const sealed = await encryptBytes(plain, key);
assert.notDeepEqual(
  sealed.bytes.slice(0, plain.length),
  plain,
  'ciphertext differs from plaintext',
);
assert.equal(
  sealed.bytes.length,
  plain.length + 16,
  'the tag rides on the end',
);
assert.deepEqual(
  await decryptBytes(sealed.bytes, key, sealed.nonce),
  plain,
  'round trip',
);
await assert.rejects(
  decryptBytes(sealed.bytes, otherKey, sealed.nonce),
  'a wrong key does not open it',
);
const again = await encryptBytes(plain, key);
assert.notEqual(again.nonce, sealed.nonce, 'each seal has its own nonce');

console.log('sealedBytes: ok');
