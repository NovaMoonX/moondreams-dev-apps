import { fetchPageContent } from '@/lib/pageContent/fetchPageContent';
import type {
  RecipeRevision,
  RevisionInput,
} from '@apps/pinch/lib/reviseRecipe';

const OPEN_TIMEOUT_MS = 8000;

/** Drops each link the revision added that its page can't be opened for; says so in the reply only when every added link failed. */
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
    added.flatMap((link, index) =>
      results[index].status === 'rejected' ? [link.url] : [],
    ),
  );
  if (failed.size === 0) return revision;

  return {
    ...revision,
    links: revision.links.filter((link) => !failed.has(link.url)),
    reply:
      failed.size === added.length
        ? `${revision.reply} Couldn't open the link it found, so left it out.`
        : revision.reply,
  };
}
