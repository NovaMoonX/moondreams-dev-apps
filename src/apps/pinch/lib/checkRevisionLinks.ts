import { fetchPageContent } from '@/lib/pageContent/fetchPageContent';
import type {
  RecipeRevision,
  RevisionInput,
} from '@apps/pinch/lib/reviseRecipe';

const OPEN_TIMEOUT_MS = 8000;

// The function reports a gone page in its message ("returned an error (404)") and an unknown host as invalid-argument; a timeout, a block or anything else says nothing about the page.
const isGone = (error: unknown) => {
  const { code, message } = (error ?? {}) as Record<string, unknown>;
  if (typeof message !== 'string') return false;
  return (
    /returned an error \((404|410)\)/.test(message) ||
    (code === 'functions/invalid-argument' &&
      message.includes('Could not resolve that link'))
  );
};

/** Drops each link the revision added whose page clearly does not exist (gone or an unknown host), keeping any a timeout, a block or another failure leaves unsure; says so in the reply. */
export async function dropUnopenableLinks(
  revision: RecipeRevision,
  input: RevisionInput,
): Promise<RecipeRevision> {
  const known = new Set(input.links.map((link) => link.url));
  const added = revision.links.filter((link) => !known.has(link.url));
  if (added.length === 0) return revision;

  const results = await Promise.allSettled(
    added.map((link) =>
      fetchPageContent(
        { url: link.url, include: ['meta'] },
        { timeoutMs: OPEN_TIMEOUT_MS },
      ),
    ),
  );
  const failed = new Set(
    added.flatMap((link, index) => {
      const result = results[index];
      return result.status === 'rejected' && isGone(result.reason)
        ? [link.url]
        : [];
    }),
  );
  if (failed.size === 0) return revision;

  return {
    ...revision,
    links: revision.links.filter((link) => !failed.has(link.url)),
    reply:
      failed.size === added.length
        ? `${revision.reply} Couldn't open the link it found, so left it out.`
        : `${revision.reply} Left out ${failed.size} ${failed.size === 1 ? 'link' : 'links'} it found that wouldn't open.`,
  };
}
