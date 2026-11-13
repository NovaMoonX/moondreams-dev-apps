import { Children, isValidElement, type ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import Markdown, { type Components } from 'react-markdown';

import ExternalLinkText from '@/components/ExternalLinkText';

interface MarkdownTextProps {
  text: string;
  className?: string;
}

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
    <p className='text-foreground text-[15px] leading-[22px] break-words'>
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className='ml-5 list-disc space-y-1 text-[15px] leading-[22px]'>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className='ml-5 list-decimal space-y-1 text-[15px] leading-[22px]'>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className='break-words'>{children}</li>,
  strong: ({ children }) => (
    <strong className='font-semibold'>{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote className='border-border text-muted-foreground border-l-2 pl-3'>
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
  a: ({ href, children }) =>
    href ? (
      <ExternalLinkText
        href={href}
        label={toPlainText(children) || undefined}
        className='text-[length:inherit]'
      />
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

/** Markdown drawn in the theme's tokens: links open outside, a picture shows only as its description, and raw HTML shows as plain text. */
function MarkdownText({ text, className }: MarkdownTextProps) {
  return (
    <div className={join('space-y-2', className)}>
      <Markdown components={COMPONENTS}>{text}</Markdown>
    </div>
  );
}

export default MarkdownText;
