import { toAddress } from './emailUtils.js';

export interface ConfirmationMail {
  from: string;
  subject: string;
  text: string;
  isDkimPassed: boolean;
}

const GMAIL_SENDER = 'forwarding-noreply@google.com';
const YAHOO_DOMAINS = ['yahoo.com', 'yahoo-inc.com', 'yahoomail.com'];

const PROTON_DOMAINS = ['proton.me', 'protonmail.com', 'pm.me'];

const isYahooSender = (from: string) => {
  const domain = toAddress(from).split('@')[1] ?? '';
  return YAHOO_DOMAINS.some(
    (known) => domain === known || domain.endsWith(`.${known}`),
  );
};

export function isProtonSender(from: string) {
  const domain = toAddress(from).split('@')[1] ?? '';
  return PROTON_DOMAINS.some(
    (known) => domain === known || domain.endsWith(`.${known}`),
  );
}

/** The invitation's accept link: a proton.me https link that mentions forwarding, accepting or an invite; support, legal and blog pages are never it. */
export function readProtonLink(text: string) {
  const links = Array.from(
    text.matchAll(
      /(?:^|[\s"'<(])(https:\/\/((?:[a-z0-9-]+\.)*proton\.me)(?=[/?#\s"'<>)\]]|$)(\/[^\s"'<>)\]]*)?)/gi,
    ),
  )
    .filter(
      ([, , host, path = '']) =>
        !/^(?:help|legal|policies)\./i.test(host) &&
        !/^\/(?:support|legal|blog)(?:[/?#]|$)/i.test(path),
    )
    .map(([, link]) => link);
  const isInvitePath = (link: string) =>
    /forward|accept|invite/i.test(link.replace(/^https:\/\/[^/]+/i, ''));
  return links.find(isInvitePath);
}

/** Gmail's, Yahoo's or Proton's "confirm this forwarding address" email; the sender's signature must have passed. */
export const isForwardingConfirmation = (mail: ConfirmationMail) =>
  (toAddress(mail.from) === GMAIL_SENDER &&
    mail.isDkimPassed &&
    /forwarding confirmation/i.test(mail.subject)) ||
  (isYahooSender(mail.from) &&
    mail.isDkimPassed &&
    /forward/i.test(mail.subject) &&
    /verif|confirm/i.test(mail.subject)) ||
  (isProtonSender(mail.from) &&
    mail.isDkimPassed &&
    /forward/i.test(mail.subject) &&
    readProtonLink(mail.text) !== undefined);

function readYahooLink(text: string) {
  const links = Array.from(
    text.matchAll(
      /(?:^|[\s"'<(])(https:\/\/((?:[a-z0-9-]+\.)*yahoo\.com)\/[^\s"'<>)\]]+)/gi,
    ),
  )
    .filter(([, , host]) => !/^(?:help|legal|policies)\./i.test(host))
    .map(([, link]) => link);
  const isVerifyPath = (link: string) =>
    /verif|confirm/i.test(
      link.replace(/^https:\/\/[^/]+/i, '').split(/[?#]/)[0],
    );
  return (
    links.find((link) => isVerifyPath(link) && link.includes('?')) ??
    links.find(isVerifyPath) ??
    links[0]
  );
}

/** The link and the code a forwarding confirmation carries; the link is limited to Google's, Yahoo's and Proton's own hosts. */
export function readConfirmation(mail: ConfirmationMail) {
  const readGoogleLink = () =>
    /https:\/\/mail(?:-settings)?\.google\.com\/[^\s"'<>)\]]+/i.exec(
      mail.text,
    )?.[0];
  const url = isYahooSender(mail.from)
    ? readYahooLink(mail.text)
    : isProtonSender(mail.from)
      ? readProtonLink(mail.text)
      : readGoogleLink();
  const code = /code[^0-9]{0,60}(\d{6,9})\b/i.exec(mail.text)?.[1];
  return {
    confirmUrl: url?.replace(/[.,;]+$/, '').slice(0, 2000) ?? null,
    confirmCode: code ?? null,
  };
}
