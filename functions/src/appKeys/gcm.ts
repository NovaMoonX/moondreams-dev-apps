import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function gcmEncrypt(key: Buffer, plain: Buffer, aad: Buffer | null) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  if (aad) cipher.setAAD(aad);
  const body = Buffer.concat([
    cipher.update(plain),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    ciphertext: body.toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

export function gcmDecrypt(
  key: Buffer,
  ciphertext: string,
  nonce: string,
  aad: Buffer | null,
) {
  const body = Buffer.from(ciphertext, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(nonce, 'base64'),
    { authTagLength: TAG_BYTES },
  );
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  const plain = Buffer.concat([
    decipher.update(body.subarray(0, body.length - TAG_BYTES)),
    decipher.final(),
  ]);
  return plain;
}
