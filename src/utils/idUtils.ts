// crypto.randomUUID is missing on plain-HTTP origins (a LAN or Tailscale link); getRandomValues is not.
export function generateUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const result = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  return result;
}

const TOKEN_ALPHABET = '23456789abcdefghjklmnpqrstuvwxyz';

/** A random string over 32 look-alike-free characters (no 0, 1, i or o), 5 bits each, drawn from the browser's CSPRNG. */
export function generateToken(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const result = Array.from(bytes, (byte) => TOKEN_ALPHABET[byte & 31]).join('');
  return result;
}
