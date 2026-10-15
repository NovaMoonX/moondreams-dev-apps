import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface Fact {
  key: string;
  content: ReactNode;
}

interface FactsLineProps {
  facts: Fact[];
  className?: string;
}

/** Short facts on one line with a dot between them; when they wrap, the wrap falls between two facts and no dot is left at either end of a line. */
function FactsLine({ facts, className }: FactsLineProps) {
  if (facts.length === 0) {
    return null;
  }

  return (
    <div className={join('overflow-x-clip', className)}>
      {/* Each fact carries its dot in front, and the list starts one dot to the left, so a line's first dot is clipped. */}
      <ul className='-ml-4 flex flex-wrap items-center'>
        {facts.map((fact) => (
          <li
            key={fact.key}
            className="inline-flex items-center whitespace-nowrap before:w-4 before:shrink-0 before:text-center before:content-['·']"
          >
            {fact.content}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FactsLine;
