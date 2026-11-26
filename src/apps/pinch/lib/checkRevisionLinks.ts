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

const toLeftOutNote = (leftOut: number, brought: number) =>
  leftOut === 1 && brought === 1
    ? "Couldn't confirm the link it found, so left it out."
    : `Left out ${leftOut} ${leftOut === 1 ? 'link' : 'links'} it found that couldn't be confirmed.`;

/** Drops each link the revision added whose page clearly does not exist (gone or an unknown host), keeping any a timeout, a block or another failure leaves unsure; the reply says how many links were left out, counting the ones the server already dropped. */
export async function dropUnopenableLinks(
  revision: RecipeRevision,
  input: RevisionInput,
): Promise<RecipeRevision> {
  const known = new Set(input.links.map((link) => link.url));
  const added = revision.links.filter((link) => !known.has(link.url));
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
  const leftOut = revision.droppedLinks + failed.size;
  if (leftOut === 0) return revision;

  return {
    ...revision,
    links: revision.links.filter((link) => !failed.has(link.url)),
    reply: `${revision.reply} ${toLeftOutNote(leftOut, leftOut + added.length - failed.size)}`,
  };
}
