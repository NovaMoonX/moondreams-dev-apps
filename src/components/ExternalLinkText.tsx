import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ExternalLink } from 'lucide-react';

interface ExternalLinkTextProps {
  href: string;
  className?: string;
}

function formatLinkLabel(href: string) {
  try {
    const url = new URL(href);
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return href;
  }
}

/** A single-line, truncated outbound link. The parent needs `min-w-0` for truncation to kick in inside flex layouts. */
function ExternalLinkText({ href, className }: ExternalLinkTextProps) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noreferrer'
      className={join(
        'text-primary inline-flex max-w-full items-center gap-1 text-sm hover:underline',
        className,
      )}
    >
      <span className='truncate'>{formatLinkLabel(href)}</span>
      <ExternalLink className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
    </a>
  );
}

export default ExternalLinkText;
