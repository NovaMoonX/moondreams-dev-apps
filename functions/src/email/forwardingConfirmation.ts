import { toAddress } from './emailUtils.js';

export interface ConfirmationMail {
  from: string;
  subject: string;
  text: string;
  isDkimPassed: boolean;
}

const GMAIL_SENDER = 'forwarding-noreply@google.com';
const YAHOO_DOMAINS = ['yahoo.com', 'yahoo-inc.com', 'yahoomail.com'];

const isYahooSender = (from: string) => {
  const domain = toAddress(from).split('@')[1] ?? '';
  return YAHOO_DOMAINS.some(
    (known) => domain === known || domain.endsWith(`.${known}`),
  );
};

/** Gmail's or Yahoo's "confirm this forwarding address" email; the sender's signature must have passed. */
export const isForwardingConfirmation = (mail: ConfirmationMail) =>
  (toAddress(mail.from) === GMAIL_SENDER &&
    mail.isDkimPassed &&
    /forwarding confirmation/i.test(mail.subject)) ||
  (isYahooSender(mail.from) &&
    mail.isDkimPassed &&
    /forward/i.test(mail.subject) &&
    /verif|confirm/i.test(mail.subject));

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

/** The link and the code a forwarding confirmation carries; the link is limited to Google's and Yahoo's own hosts. */
export function readConfirmation(mail: ConfirmationMail) {
  const url = isYahooSender(mail.from)
    ? readYahooLink(mail.text)
    : /https:\/\/mail(?:-settings)?\.google\.com\/[^\s"'<>)\]]+/i.exec(
        mail.text,
      )?.[0];
  const code = /code[^0-9]{0,60}(\d{6,9})\b/i.exec(mail.text)?.[1];
  return {
    confirmUrl: url?.replace(/[.,;]+$/, '').slice(0, 2000) ?? null,
    confirmCode: code ?? null,
  };
}
