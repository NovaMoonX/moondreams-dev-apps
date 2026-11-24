import type { EmailConfirm } from '@/lib/emailForwarding/types';

/** An address cut where it may wrap: after `prefix`, after the @ and before each dot, so the token itself never breaks. */
export const splitAddressForWrap = (address: string, prefix = '') =>
  address.split(
    new RegExp(`${prefix === '' ? '' : `(?<=^${prefix})|`}(?<=@)|(?=\\.)`),
  );

/** The address on one line: `prefix` and four characters of the token, an ellipsis, then the domain. */
export const shortenForwardingAddress = (address: string, prefix: string) => {
  const [name, ...host] = address.split('@');
  const keep = prefix.length + 1 + 4;
  return name.length <= keep + 1
    ? address
    : `${name.slice(0, keep)}…@${host.join('@')}`;
};

/** The providers whose forwarding confirmation the server recognises, as the person knows them. */
export const CONFIRM_PROVIDER_NAMES = {
  gmail: 'Gmail',
  yahoo: 'Yahoo',
  proton: 'Proton Mail',
} as const;

export const readConfirmLink = (confirm: EmailConfirm) =>
  confirm.url?.startsWith('https://') ? confirm.url : null;

/** Whether the confirm notice draws anything for this confirmation. */
export const hasConfirmNotice = (confirm: EmailConfirm) =>
  confirm.autoConfirm === 'confirmed' ||
  readConfirmLink(confirm) !== null ||
  confirm.code !== null;
