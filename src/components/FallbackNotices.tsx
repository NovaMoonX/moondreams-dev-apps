import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { TriangleAlert } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import CopyTextButton from '@/components/CopyTextButton';
import DebugDetails from '@/components/DebugDetails';
import DetailSheet from '@/components/DetailSheet';
import { useFallbacks } from '@/hooks/useFallbacks';
import { SITE_VERSION } from '@/lib/app';
import { useCanSeeDebugDetails } from '@/lib/debugProfiles/useCanSeeDebugDetails';
import type { Fallback } from '@/lib/fallbacks/fallbacks';
import { formatTime } from '@/utils/formatUtils';

const PILL_MS = 5000;

const toLine = ({ used, wanted, reason, recoveredAt }: Fallback) =>
  recoveredAt === null
    ? `Using ${used} instead of ${wanted}: ${reason}`
    : `Working again. Earlier it used ${used} instead of ${wanted}: ${reason}`;

const toShort = ({ used, wanted }: Fallback) => {
  const text = `${used} instead of ${wanted}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const toFacts = (fallback: Fallback) => [
  `Feature: ${fallback.feature}`,
  `Wanted: ${fallback.wanted}`,
  `Used: ${fallback.used}`,
  ...fallback.facts,
  ...(fallback.recoveredAt === null
    ? []
    : [`Working again at ${formatTime(fallback.recoveredAt)}`]),
  fallback.count === 1
    ? `Happened once at ${formatTime(fallback.lastAt)}`
    : `Happened ${fallback.count} times, first at ${formatTime(fallback.firstAt)}, last at ${formatTime(fallback.lastAt)}`,
];

const toCopyAll = (fallbacks: Fallback[], pathname: string) =>
  [
    ...fallbacks.map((fallback) =>
      [toLine(fallback), toFacts(fallback).join('\n'), fallback.trace]
        .filter(Boolean)
        .join('\n\n'),
    ),
    `Page: ${pathname}`,
    `Version: ${SITE_VERSION}`,
  ].join('\n\n---\n\n');

const toOrdered = (fallbacks: Fallback[]) => [
  ...fallbacks.filter((fallback) => fallback.recoveredAt === null),
  ...fallbacks.filter((fallback) => fallback.recoveredAt !== null),
];

function FallbackTab({
  fallbacks,
  dismiss,
}: {
  fallbacks: Fallback[];
  dismiss: (key: string, reason: string) => void;
}) {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [announcedUntil, setAnnouncedUntil] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const ordered = toOrdered(fallbacks);
  const active = ordered.filter((fallback) => fallback.recoveredAt === null);
  const newest = active.reduce<Fallback | null>(
    (best, fallback) =>
      best === null || fallback.activeSince > best.activeSince
        ? fallback
        : best,
    null,
  );
  const newestSince = newest?.activeSince ?? 0;

  useEffect(() => {
    if (newestSince === 0) return;
    const id = window.setTimeout(
      () => setAnnouncedUntil((before) => Math.max(before, newestSince)),
      PILL_MS,
    );
    return () => window.clearTimeout(id);
  }, [newestSince]);

  const pill = newest !== null && newestSince > announcedUntil ? newest : null;
  const label = `What isn't working (${ordered.length})`;

  return (
    <>
      <Button
        type='button'
        variant='base'
        size='sm'
        aria-label={pill === null ? label : `${label}: ${toShort(pill)}`}
        className={join(
          "fixed top-1/2 left-0 z-[125] flex h-10 -translate-y-1/2 items-center justify-center rounded-l-none rounded-r-xl border border-l-0 p-0 shadow-md before:absolute before:inset-y-0 before:-right-2 before:left-0 before:content-['']",
          active.length > 0
            ? 'border-warning/60 dark:text-warning bg-[color-mix(in_srgb,var(--color-warning)_30%,var(--color-background))] text-amber-900'
            : 'border-border bg-muted text-muted-foreground',
          pill === null
            ? 'w-6 max-w-6 flex-col gap-0'
            : 'max-w-[calc(100vw-48px)] min-w-6 gap-1.5 px-2',
        )}
        onClick={() => {
          setAnnouncedUntil(newestSince);
          setIsOpen(true);
        }}
      >
        <TriangleAlert className='size-3.5 shrink-0' aria-hidden='true' />
        {pill === null ? (
          ordered.length > 1 && (
            <span className='text-[10px] leading-none font-semibold'>
              {ordered.length}
            </span>
          )
        ) : (
          <span className='min-w-0 truncate text-xs font-medium'>
            {toShort(pill)}
          </span>
        )}
      </Button>
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="What isn't working"
        actions={
          <CopyTextButton
            isIconOnly
            variant='tertiary'
            label='Copy all'
            text={toCopyAll(ordered, pathname)}
          />
        }
      >
        <ul ref={listRef} data-site-sheet className='space-y-3'>
          {ordered.map((fallback, index) => (
            <li
              key={fallback.key}
              className='border-border space-y-1.5 border-b pb-3 last:border-b-0 last:pb-0'
            >
              <p className='text-sm font-medium'>{toLine(fallback)}</p>
              <p className='text-muted-foreground text-xs'>
                {fallback.count === 1
                  ? `Once, at ${formatTime(fallback.lastAt)}`
                  : `${fallback.count} times, last at ${formatTime(fallback.lastAt)}`}
              </p>
              <DebugDetails
                title='What went wrong'
                message={toLine(fallback)}
                facts={toFacts(fallback)}
                trace={
                  fallback.trace === null
                    ? null
                    : { label: 'What was recorded', text: fallback.trace }
                }
                className='[&_pre]:max-h-none [&_pre]:overflow-visible'
              />
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                data-dismiss
                className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
                onClick={() => {
                  dismiss(fallback.key, fallback.reason);
                  window.setTimeout(
                    () =>
                      Array.from(
                        listRef.current?.querySelectorAll<HTMLElement>(
                          'button[data-dismiss]',
                        ) ?? [],
                      )
                        .slice(0, index + 1)
                        .at(-1)
                        ?.focus(),
                    0,
                  );
                }}
              >
                Dismiss for this session
              </Button>
            </li>
          ))}
        </ul>
      </DetailSheet>
    </>
  );
}

/** A left-edge tab that opens what the site fell back from, for debug viewers only. */
function FallbackNotices() {
  const canSee = useCanSeeDebugDetails();
  const { fallbacks, dismiss } = useFallbacks();
  if (!canSee || fallbacks.length === 0) return null;
  return <FallbackTab fallbacks={fallbacks} dismiss={dismiss} />;
}

export default FallbackNotices;
