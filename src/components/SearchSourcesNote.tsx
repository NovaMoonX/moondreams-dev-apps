import ExternalLinkText from '@/components/ExternalLinkText';
import { getWebLinkHost } from '@/utils/urlUtils';

interface SearchSourcesNoteProps {
  sources: { title: string; url: string }[];
}

const MAX_SOURCES_SHOWN = 3;

/** The pages a web search used, shown beside what an AI found with it so the person can see where it came from. Nothing when it did not search. */
function SearchSourcesNote({ sources }: SearchSourcesNoteProps) {
  const shown = sources
    .filter((source) => /^https?:\/\//i.test(source.url))
    .slice(0, MAX_SOURCES_SHOWN);

  if (shown.length === 0) return null;

  return (
    <p className='text-muted-foreground flex flex-wrap items-center gap-x-1 pt-1 text-xs'>
      <span>Sources:</span>
      {shown.map((source, index) => (
        <span
          key={source.url}
          className='inline-flex max-w-full min-w-0 items-center'
        >
          <ExternalLinkText
            href={source.url}
            label={source.title || getWebLinkHost(source.url) || source.url}
            className='text-xs'
          />
          {index < shown.length - 1 && ','}
        </span>
      ))}
    </p>
  );
}

export default SearchSourcesNote;
