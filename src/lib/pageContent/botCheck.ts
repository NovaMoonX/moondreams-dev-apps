import type { PageContent } from '@/lib/pageContent/fetchPageContent';

const CHECK_TITLE =
  /^(robot or human|access denied|just a moment|attention required|pardon our interruption|are you a (robot|human)|verify you are (a )?human|security check|request blocked|captcha)/i;
const CHECK_TEXT =
  /(verify|confirm) (that )?you('re| are) (not )?a (robot|human)|press (and|&) hold|unusual (traffic|activity)|enable javascript and cookies|captcha/i;
const MAX_CHECK_TEXT_CHARS = 1500;

export const BLOCKED_PAGE_CODE = 'blocked-page';

/** Whether a fetched page is a bot check or an access wall rather than the page asked for; a page that publishes its own structured data is never one. */
export function isBotCheckPage(page: PageContent) {
  if (page.structuredData?.length) return false;
  if (CHECK_TITLE.test(page.title?.trim() ?? '')) return true;

  const text = page.text ?? '';
  const result = text.length <= MAX_CHECK_TEXT_CHARS && CHECK_TEXT.test(text);
  return result;
}

/** Thrown for a page that turned out to be a bot check, so a caller treats it as a failed read and not as an empty page. */
export class BotCheckError extends Error {
  code = BLOCKED_PAGE_CODE;

  constructor() {
    super('The page is a bot check.');
  }
}
