import type { ElementType, ReactNode } from 'react';

import { Lock } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import { HELM_COPY } from '@apps/helm/constants';
import { useIsPrivate } from '@apps/helm/hooks/useIsPrivate';
import type {
  PrivacyRecord,
  PrivateKind,
} from '@apps/helm/utils/privacyParents';

type PrivateSource =
  | { kind: PrivateKind; record: PrivacyRecord; isPrivate?: undefined }
  | { isPrivate: boolean; kind?: undefined; record?: undefined };

type PrivateTitleProps = PrivateSource & {
  /** The text classes of the title; the clamp is `lines`, never a class here. */
  className?: string;
  /** Clamps the words to this many lines; the lock sits beside them, so a clamp never cuts it off. */
  lines?: 1 | 3;
  as?: ElementType;
  children: ReactNode;
};

const NO_RECORD: PrivacyRecord = { id: '' };

/** A title with the quiet lock of a private thing after it. A clamped title keeps the lock beside its words so the clamp never cuts it; a wrapping one keeps it after the last word. */
function PrivateTitle({
  kind,
  record,
  isPrivate,
  className,
  lines,
  as: Tag = 'span',
  children,
}: PrivateTitleProps) {
  const isRead = useIsPrivate(kind ?? 'task', record ?? NO_RECORD);
  const isOn = isPrivate ?? isRead;
  const lock = isOn && (
    <Lock
      className={join(
        'text-muted-foreground size-3.5 shrink-0',
        lines ? 'mt-[3.5px]' : 'ml-1 inline-block align-[-2px]',
      )}
      role='img'
      aria-label={HELM_COPY.privateLockLabel}
    />
  );
  if (!lines) {
    // A word joiner keeps the lock on the last word's line when the title wraps.
    return (
      <Tag className={join('block min-w-0 break-words', className)}>
        {children}
        {isOn && (
          <span className='whitespace-nowrap'>
            {'\u2060'}
            {lock}
          </span>
        )}
      </Tag>
    );
  }
  return (
    <Tag className={join('flex min-w-0 items-start gap-1', className)}>
      <span
        className={join(
          'min-w-0 break-words',
          lines === 1 && 'line-clamp-1',
          lines === 3 && 'line-clamp-3',
        )}
      >
        {children}
      </span>
      {lock}
    </Tag>
  );
}

export default PrivateTitle;
