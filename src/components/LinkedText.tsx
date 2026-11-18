import { Fragment } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import ExternalLinkText from '@/components/ExternalLinkText';

interface LinkedTextProps {
  text: string;
  className?: string;
}

const LINK = /(https?:\/\/[^\s<>"']+)/g;
const count = (text: string, mark: string) => text.split(mark).length - 1;

const trimTrailing = (url: string): string => {
  const last = url.slice(-1);
  const isUnmatchedParen = last === ')' && count(url, ')') > count(url, '(');
  return /[.,;:!?\]}]/.test(last) || isUnmatchedParen
    ? trimTrailing(url.slice(0, -1))
    : url;
};

/** Plain runs and web links in order; punctuation that ends a sentence, and a closing bracket with no opening one, stays outside the link. */
const splitLinks = (text: string) =>
  text.split(LINK).flatMap((part, index) => {
    if (index % 2 === 0)
      return part ? [{ kind: 'text' as const, value: part }] : [];
    const href = trimTrailing(part);
    const trailing = part.slice(href.length);
    return [
      { kind: 'link' as const, value: href },
      ...(trailing ? [{ kind: 'text' as const, value: trailing }] : []),
    ];
  });

/** Text with its http(s) links tappable and its line breaks kept. */
function LinkedText({ text, className }: LinkedTextProps) {
  return (
    <p className={join('break-words whitespace-pre-wrap', className)}>
      {splitLinks(text).map((part, index) => (
        <Fragment key={index}>
          {part.kind === 'link' ? (
            <ExternalLinkText
              href={part.value}
              className='text-[length:inherit]'
            />
          ) : (
            part.value
          )}
        </Fragment>
      ))}
    </p>
  );
}

export default LinkedText;
