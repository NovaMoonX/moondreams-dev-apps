/** The text to paste into Gmail's search box so only one sender's mail is forwarded, built from the sender the person typed. */
export const buildGmailFilterText = (
  address: string,
  subjectWords: readonly string[],
) =>
  subjectWords.length === 0
    ? `from:(${address})`
    : `from:(${address}) subject:(${subjectWords.join(' OR ')})`;

/** The first email address in what the person typed or pasted ("Name <a@b.com>" gives "a@b.com"), or null. */
export const readSenderAddress = (text: string) =>
  /[^\s<>,;"']+@[^\s<>,;"']+/.exec(text)?.[0] ?? null;

/** An address split after its `@`, so a display may break only there and keep the domain whole. */
export function splitAddress(address: string) {
  const at = address.indexOf('@');
  return at < 0
    ? { local: address, domain: '' }
    : { local: address.slice(0, at + 1), domain: address.slice(at + 1) };
}
