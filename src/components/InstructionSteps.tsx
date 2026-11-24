import type { ReactNode } from 'react';

import { Check, ExternalLink } from 'lucide-react';

export interface Instruction {
  text: string;
  href?: string;
  control?: ReactNode;
}

/** Instructions the person carries out in another app, shown one at a time; the caller owns `current` and moves it from its own Next and Back. */
function InstructionSteps({
  items,
  current,
}: {
  items: Instruction[];
  current: number;
}) {
  const index = Math.min(Math.max(current, 0), items.length - 1);
  const item = items[index];
  if (item === undefined) return null;
  return (
    <div className='space-y-4'>
      {index > 0 && (
        <ol className='space-y-1.5'>
          {items.slice(0, index).map((done, doneIndex) => (
            <li
              key={doneIndex}
              className='text-muted-foreground flex items-start gap-2 text-sm'
            >
              <Check
                className='text-success mt-0.5 size-4 shrink-0'
                aria-label='Done'
              />
              <span className='line-clamp-1 min-w-0 flex-1'>{done.text}</span>
            </li>
          ))}
        </ol>
      )}
      <div
        key={index}
        aria-live='polite'
        className='space-y-3 motion-safe:animate-[snackbar-in_200ms_ease-out]'
      >
        {items.length > 1 && (
          <p className='text-muted-foreground text-xs font-medium'>
            {index + 1} of {items.length}
          </p>
        )}
        <p className='text-lg leading-snug font-medium break-words'>
          {item.href === undefined ? (
            item.text
          ) : (
            <a
              href={item.href}
              target='_blank'
              rel='noreferrer'
              className='text-primary -my-2 inline-block py-2 underline underline-offset-4'
            >
              {item.text}
              <ExternalLink
                className='ml-1.5 inline size-4 align-[-2px]'
                aria-hidden='true'
              />
            </a>
          )}
        </p>
        {item.control}
      </div>
    </div>
  );
}

export default InstructionSteps;
