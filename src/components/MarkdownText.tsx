import { Children, isValidElement, useMemo, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ExternalLink } from 'lucide-react';
import Markdown, { type Components } from 'react-markdown';

import { createLinkGate, labelForLink } from '@/utils/proseUtils';

interface MarkdownTextProps {
  text: string;
  className?: string;
  allowedLinks?: ReadonlySet<string> | null;
}

const isWebUrl = createLinkGate(null);
const keepWebUrl = (url: string) => (isWebUrl(url) ? url : '');

const LONG_WORD = 20;
const TAIL = 4;

const toPlainText = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? toPlainText(child.props.children)
          : '',
    )
    .join('');

const splitTail = (label: string) => {
  const trimmed = label.trim();
  const at = trimmed.search(/\S+$/);
  const word = trimmed.slice(at);
  const cut = word.length > LONG_WORD ? word.length - TAIL : 0;
  return { head: trimmed.slice(0, at + cut), tail: word.slice(cut) };
};

function ProseLink({ href, label }: { href: string; label: string }) {
  const { head, tail } = splitTail(label);
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='text-primary decoration-primary box-decoration-clone py-0.5 break-words underline underline-offset-2 hover:no-underline'
    >
      {head}
      <span className='whitespace-nowrap'>
        {tail}
        <ExternalLink
          className='ml-0.5 inline-block size-3 align-[-1px]'
          aria-hidden='true'
        />
      </span>
    </a>
  );
}

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className='text-foreground mt-3 text-base font-semibold first:mt-0'>
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className='text-foreground mt-3 text-[15px] font-semibold first:mt-0'>
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className='text-foreground mt-3 text-sm font-semibold first:mt-0'>
      {children}
    </h5>
  ),
  p: ({ children }) => (
    <p className='text-[15px] leading-[22px] text-pretty break-words'>
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className='ml-5 list-disc space-y-1 text-[15px] leading-[22px]'>
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol
      start={start}
      className='ml-5 list-decimal space-y-1 text-[15px] leading-[22px]'
    >
      {children}
    </ol>
  ),
  li: ({ children }) => <li className='break-words'>{children}</li>,
  strong: ({ children }) => (
    <strong className='font-semibold'>{children}</strong>
  ),
  em: ({ children }) => <em className='italic'>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className='border-muted-foreground/40 space-y-2 border-l-2 pl-3'>
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      className={join(
        'bg-muted rounded-[6px] px-1 py-0.5 font-mono text-[13px]',
        className,
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className='bg-muted overflow-x-auto rounded-[10px] p-3 [&_code]:bg-transparent [&_code]:p-0'>
      {children}
    </pre>
  ),
  hr: () => <hr className='border-border' />,
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

/** Markdown drawn in the theme's tokens (text takes the colour of what holds it): only http(s) links are links, and they open outside, a picture shows only as its description, and raw HTML shows as plain text. */
function MarkdownText({
  text,
  className,
  allowedLinks = null,
}: MarkdownTextProps) {
  const components = useMemo<Components>(() => {
    const gate = createLinkGate(allowedLinks);
    return {
      ...COMPONENTS,
      a: ({ href, children }) => {
        const safe = gate(href);
        return safe ? (
          <ProseLink
            href={safe}
            label={labelForLink(toPlainText(children) || safe, safe)}
          />
        ) : (
          <span>{children}</span>
        );
      },
    };
  }, [allowedLinks]);
  return (
    <div className={join('space-y-2', className)}>
      <Markdown components={components} urlTransform={keepWebUrl}>
        {text}
      </Markdown>
    </div>
  );
}

export default MarkdownText;
