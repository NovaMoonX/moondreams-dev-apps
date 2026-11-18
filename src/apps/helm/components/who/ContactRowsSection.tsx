import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Mail, Phone } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import AddRow from '@apps/helm/components/who/AddRow';
import ContactPointSheet from '@apps/helm/components/who/ContactPointSheet';
import { HELM_COPY } from '@apps/helm/constants';
import {
  sortPrimaryFirst,
  type ContactKind,
} from '@apps/helm/engine/contactPoints';
import type { OpenWho } from '@apps/helm/types';

interface ContactRowsSectionProps {
  who: OpenWho;
}

interface Target {
  kind: ContactKind;
  /** Null while adding. */
  pointId: string | null;
}

/** "How to reach": a person's phones then emails, each primary first, its number or address on one line and its label under it; every action is in the row's sheet. */
function ContactRowsSection({ who }: ContactRowsSectionProps) {
  const [target, setTarget] = useState<Target | null>(null);
  const rows = [
    ...sortPrimaryFirst(who.phones).map((point) => ({
      kind: 'phone' as const,
      point,
    })),
    ...sortPrimaryFirst(who.emails).map((point) => ({
      kind: 'email' as const,
      point,
    })),
  ];
  const kind = target?.kind ?? 'phone';
  const points = kind === 'phone' ? who.phones : who.emails;
  const point = points.find((entry) => entry.id === target?.pointId) ?? null;

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.whoReachTitle} />
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {rows.map(({ kind: rowKind, point: row }) => (
          <li key={`${rowKind}-${row.id}`}>
            <Button
              type='button'
              variant='tertiary'
              className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
              onClick={() => setTarget({ kind: rowKind, pointId: row.id })}
            >
              {rowKind === 'phone' ? (
                <Phone
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              ) : (
                <Mail
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              )}
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='text-foreground truncate text-[15px]'>
                  {row.value}
                </span>
                <span className='flex min-w-0 items-center gap-2'>
                  <span className='text-muted-foreground min-w-0 truncate text-[13px]'>
                    {row.label}
                  </span>
                  {row.isPrimary && (
                    <span className='bg-accent text-accent-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px]'>
                      {HELM_COPY.contactPrimary}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
        <li>
          <AddRow
            isInList
            label={HELM_COPY.contactAddPhone}
            onClick={() => setTarget({ kind: 'phone', pointId: null })}
          />
        </li>
        <li>
          <AddRow
            isInList
            label={HELM_COPY.contactAddEmail}
            onClick={() => setTarget({ kind: 'email', pointId: null })}
          />
        </li>
      </ul>
      <ContactPointSheet
        isOpen={target !== null}
        onClose={() => setTarget(null)}
        whoId={who.id}
        kind={kind}
        point={point}
        isMissing={target?.pointId != null && point === null}
        points={points}
      />
    </section>
  );
}

export default ContactRowsSection;
