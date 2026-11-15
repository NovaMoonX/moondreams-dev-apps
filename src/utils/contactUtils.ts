const EXTENSION = /(?<=\d)\s*(?:x|ext\.?|,)\s*(?=\d)/i;

const splitExtension = (value: string) => {
  const [main = '', ...rest] = value.split(EXTENSION);
  return {
    number: main.replace(/[^\d+]/g, ''),
    extension: rest.join('').replace(/\D/g, ''),
  };
};

/** A typed phone number as a `tel:` number: digits and a leading +, with an extension written after the digits ("x12", "ext 12", ",12") kept as a pause then its digits. */
export function toDialableNumber(value: string) {
  const { number, extension } = splitExtension(value);
  return extension === '' ? number : `${number},${extension}`;
}

/** A typed phone number as an `sms:` number: the extension is dropped, since a pause means nothing to a text. */
export function toTextableNumber(value: string) {
  return splitExtension(value).number;
}

/** A `mailto:` link for addresses typed by a person, escaped but keeping `@` and the commas between several addresses. */
export function toMailtoUrl(address: string) {
  const escaped = encodeURIComponent(address.trim())
    .replace(/%40/g, '@')
    .replace(/%2C/gi, ',');
  return `mailto:${escaped}`;
}
