/** A typed phone number as a `tel:` or `sms:` number: digits and a leading +, with an extension ("x12", "ext 12", ",12") kept as a pause then its digits. */
export function toDialableNumber(value: string) {
  const [main = '', ...rest] = value.split(/x|ext\.?|,/i);
  const number = main.replace(/[^\d+]/g, '');
  const extension = rest.join('').replace(/\D/g, '');
  return extension === '' ? number : `${number},${extension}`;
}

/** A `mailto:` link for an address typed by a person, with the address escaped. */
export function toMailtoUrl(address: string) {
  return `mailto:${encodeURIComponent(address.trim())}`;
}
