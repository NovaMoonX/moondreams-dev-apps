import { Fragment } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import ExternalLinkText from '@/components/ExternalLinkText';

interface LinkedTextProps {
  text: string;
  className?: string;
}

const LINK = /(https?:\/\/[^\s<>"']+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/** Plain runs and web links in order; punctuation that ends a sentence stays outside the link. */
const splitLinks = (text: string) =>
  text.split(LINK).flatMap((part, index) => {
    if (index % 2 === 0)
      return part ? [{ kind: 'text' as const, value: part }] : [];
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    const href = part.slice(0, part.length - trailing.length);
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
