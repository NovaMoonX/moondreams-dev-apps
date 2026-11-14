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

/** A title with the quiet lock of a private thing after it. The lock is a flex sibling of the words, so a clamped or wrapped title never hides or strands it. */
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
      {isOn && (
        <Lock
          className='text-muted-foreground mt-[3.5px] size-3.5 shrink-0'
          role='img'
          aria-label={HELM_COPY.privateLockLabel}
        />
      )}
    </Tag>
  );
}

export default PrivateTitle;
