import { toAddress } from './emailUtils.js';

const GMAIL_SENDER = 'forwarding-noreply@google.com';
const GOOGLE_DOMAINS = ['google.com'];
const YAHOO_DOMAINS = ['yahoo.com', 'yahoo-inc.com', 'yahoomail.com'];
const GMAIL_HOSTS = ['mail.google.com', 'mail-settings.google.com'];
const YAHOO_HOSTS = ['mail.yahoo.com', 'edit.yahoo.com'];
const SIGN_IN_HOSTS = [
  'accounts.google.com',
  'consent.google.com',
  'guce.yahoo.com',
  'login.yahoo.com',
];
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const MAX_HOPS = 3;
const CONFIRM_TIMEOUT_MS = 8_000;

export type ConfirmProvider = 'gmail' | 'yahoo' | 'proton';
export type AutoConfirm = 'confirmed' | 'failed' | 'skipped';

export interface ConfirmationMail {
  from: string;
  subject: string;
  text: string;
  isDkimPassed: boolean;
  dkimDomain?: string | null;
}

interface FollowResult {
  autoConfirm: AutoConfirm;
  status: number | null;
  errorName: string | null;
}

const PROTON_DOMAINS = ['proton.me', 'protonmail.com', 'pm.me'];

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

/** Proton's forwarding invitation: from a Proton sender that passed DKIM, with forwarding in the subject and an invitation link. */
export const isProtonInvitation = (mail: ConfirmationMail): boolean =>
  isProtonSender(mail.from) &&
  mail.isDkimPassed &&
  /forward/i.test(mail.subject) &&
  readProtonLink(mail.text) !== undefined;

const isUnder = (domain: string, roots: string[]) =>
  roots.some((root) => domain === root || domain.endsWith(`.${root}`));

const isSignedBy = (mail: ConfirmationMail, roots: string[]) =>
  mail.isDkimPassed &&
  typeof mail.dkimDomain === 'string' &&
  isUnder(mail.dkimDomain.toLowerCase(), roots);

const isYahooSender = (from: string) =>
  isUnder(toAddress(from).split('@')[1] ?? '', YAHOO_DOMAINS);

const isGmailConfirmation = (mail: ConfirmationMail) =>
  toAddress(mail.from) === GMAIL_SENDER &&
  isSignedBy(mail, GOOGLE_DOMAINS) &&
  /forwarding confirmation/i.test(mail.subject);

const isYahooConfirmation = (mail: ConfirmationMail) =>
  isYahooSender(mail.from) &&
  isSignedBy(mail, YAHOO_DOMAINS) &&
  /forward/i.test(mail.subject) &&
  /verif|confirm/i.test(mail.subject) &&
  readYahooLink(mail.text) !== undefined;

/** Which provider's forwarding confirmation this is, or null. */
export function confirmProviderOf(
  mail: ConfirmationMail,
): ConfirmProvider | null {
  if (isGmailConfirmation(mail)) return 'gmail';
  if (isYahooConfirmation(mail)) return 'yahoo';
  return isProtonInvitation(mail) ? 'proton' : null;
}

/** Gmail's, Yahoo's or Proton's "confirm this forwarding address" email; the sender's signature must have passed. */
export const isForwardingConfirmation = (mail: ConfirmationMail) =>
  confirmProviderOf(mail) !== null;

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

/** Whether the server may open this confirm link: https on one of the provider's confirmation hosts. */
export function isAcceptedConfirmUrl(
  url: string | null,
  provider: ConfirmProvider | null,
): boolean {
  if (url === null || (provider !== 'gmail' && provider !== 'yahoo')) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      (provider === 'gmail' ? GMAIL_HOSTS : YAHOO_HOSTS).includes(
        parsed.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

const isSignInPage = (url: string) => {
  const { hostname, pathname } = new URL(url);
  return (
    SIGN_IN_HOSTS.includes(hostname.toLowerCase()) ||
    /\/(?:servicelogin|signin)/i.test(pathname)
  );
};

const resolveHop = (location: string | null, from: string) => {
  try {
    return location === null ? null : new URL(location, from).href;
  } catch {
    return null;
  }
};

const SUCCESS_TEXT =
  /confirmation success|you may now forward|successfully (?:confirmed|verified)|(?:forwarding|address) (?:has been |is now )?(?:confirmed|verified)/i;
const MAX_PAGE_CHARS = 200_000;

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  amp: '&',
};

const decodeAttribute = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    const code = entity.startsWith('#x')
      ? parseInt(entity.slice(2), 16)
      : entity.startsWith('#')
        ? Number(entity.slice(1))
        : null;
    return code === null
      ? (NAMED_ENTITIES[entity.toLowerCase()] ?? whole)
      : String.fromCodePoint(code);
  });

const TAG_ATTRIBUTES =
  /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const readAttributes = (tag: string) =>
  new Map(
    Array.from(tag.matchAll(TAG_ATTRIBUTES)).map(
      ([, name, double, single, bare]) => [
        name.toLowerCase(),
        decodeAttribute(double ?? single ?? bare ?? ''),
      ],
    ),
  );

const OPENING_TAG = (name: string) =>
  new RegExp(`<${name}\\b((?:"[^"]*"|'[^']*'|[^'">])*)>`, 'gi');

const CONFIRM_WORDS = /confirm|verify|accept|allow|proceed/i;

/** The page's first POST form: where it posts, its hidden fields and its one confirm button (the submit whose words say confirm, else the first), or null. */
export function readConfirmForm(html: string, pageUrl: string) {
  const forms = Array.from(
    html.matchAll(/<form\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/form>/gi),
  ).map(([, opening, inner]) => ({
    attributes: readAttributes(opening),
    inner,
  }));
  const form = forms.find(
    ({ attributes }) =>
      (attributes.get('method') ?? '').toLowerCase() === 'post',
  );
  if (form === undefined) return null;
  const action = resolveHop(form.attributes.get('action') ?? '', pageUrl);
  if (action === null) return null;
  const controls = ['input', 'button'].flatMap((tagName) =>
    Array.from(form.inner.matchAll(OPENING_TAG(tagName))).map(
      ([, attributes]) => ({ tagName, attributes: readAttributes(attributes) }),
    ),
  );
  const named = controls.filter(({ attributes }) => attributes.has('name'));
  const isSubmit = ({ tagName, attributes }: (typeof controls)[number]) =>
    tagName === 'button'
      ? (attributes.get('type') ?? 'submit').toLowerCase() === 'submit'
      : ['submit', 'image'].includes(
          (attributes.get('type') ?? '').toLowerCase(),
        );
  const hidden = named.filter(
    ({ tagName, attributes }) =>
      tagName === 'input' &&
      (attributes.get('type') ?? '').toLowerCase() === 'hidden',
  );
  const submits = named.filter(isSubmit);
  const button =
    submits.find(({ attributes }) =>
      CONFIRM_WORDS.test(
        `${attributes.get('name')} ${attributes.get('value') ?? ''}`,
      ),
    ) ?? submits[0];
  const fields = [...hidden, ...(button === undefined ? [] : [button])].map(
    ({ attributes }) =>
      [attributes.get('name') ?? '', attributes.get('value') ?? ''] as [
        string,
        string,
      ],
  );
  return { action, body: new URLSearchParams(fields).toString() };
}

const readPage = async (response: Response) =>
  (await response.text()).slice(0, MAX_PAGE_CHARS);

/** The words a page shows, without its scripts and styles, so a string inside a script bundle never reads as success. */
const shownWords = (page: string) =>
  page.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');

/** Opens a provider's confirm link and sends its confirm form at most once; `confirmed` only when the page says so, since a page that merely loads is no proof. Never throws. */
export async function followConfirmLink(
  url: string | null,
  provider: ConfirmProvider | null,
  doFetch: typeof fetch = fetch,
): Promise<FollowResult> {
  if (url === null || !isAcceptedConfirmUrl(url, provider)) {
    return { autoConfirm: 'skipped', status: null, errorName: null };
  }
  const signal = AbortSignal.timeout(CONFIRM_TIMEOUT_MS);
  const failed = (
    status: number | null,
    errorName: string | null = null,
  ): FollowResult => ({ autoConfirm: 'failed', status, errorName });
  const open = async (
    target: string,
    hops: number,
    form: { body: string } | null,
    hasSubmitted: boolean,
  ): Promise<FollowResult> => {
    if (!isAcceptedConfirmUrl(target, provider) || isSignInPage(target)) {
      return failed(null);
    }
    const response = await doFetch(target, {
      method: form === null ? 'GET' : 'POST',
      redirect: 'manual',
      credentials: 'omit',
      signal,
      ...(form === null
        ? {}
        : {
            body: form.body,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          }),
    });
    if (REDIRECT_STATUSES.includes(response.status)) {
      await response.body?.cancel();
      const next = resolveHop(
        response.headers?.get('location') ?? null,
        target,
      );
      return next === null || hops >= MAX_HOPS
        ? failed(response.status)
        : open(next, hops + 1, null, hasSubmitted);
    }
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel();
      return failed(response.status);
    }
    const page = await readPage(response);
    if (SUCCESS_TEXT.test(shownWords(page))) {
      return {
        autoConfirm: 'confirmed',
        status: response.status,
        errorName: null,
      };
    }
    const confirmForm = hasSubmitted ? null : readConfirmForm(page, target);
    return confirmForm === null
      ? failed(response.status, 'NotConfirmed')
      : open(confirmForm.action, hops, confirmForm, true);
  };
  try {
    return await open(url, 0, null, false);
  } catch (error) {
    return failed(null, (error as Error)?.name ?? 'Error');
  }
}
