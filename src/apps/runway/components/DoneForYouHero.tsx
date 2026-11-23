import type { ReactNode } from 'react';

import { ArrowRight, CircleCheck, Flag, Landmark } from 'lucide-react';

import SensitiveValue from '@/components/SensitiveValue';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PurchaseMark from '@apps/runway/components/PurchaseMark';
import type { DoneForYouKind, DoneForYouSubject } from '@apps/runway/types';

interface DoneForYouHeroProps {
  kind: DoneForYouKind;
  subject: DoneForYouSubject;
}

const formatSigned = (cents: number) =>
  cents < 0 ? `+${formatCents(-cents)}` : formatCents(cents);

function Side({
  mark,
  name,
  line,
}: {
  mark: ReactNode;
  name: string;
  line?: ReactNode;
}) {
  return (
    <span className='flex min-w-0 flex-1 items-center gap-2'>
      {mark}
      <span className='min-w-0'>
        <span className='block text-sm font-medium break-words'>{name}</span>
        {line !== undefined && (
          <span className='text-muted-foreground block text-sm'>{line}</span>
        )}
      </span>
    </span>
  );
}

/** The small before-and-after card at the top of an item in Done for you: what was acted on, then where it went. */
function DoneForYouHero({ kind, subject }: DoneForYouHeroProps) {
  const amount =
    subject.amountCents === null ? undefined : (
      <SensitiveValue>{formatSigned(subject.amountCents)}</SensitiveValue>
    );
  const destination =
    subject.toName === null ? null : (
      <Side
        mark={<ItemBadge name={subject.toName} emoji={subject.toEmoji} />}
        name={subject.toName}
      />
    );
  const frame = (children: ReactNode) => (
    <div className='border-border bg-card flex items-center gap-3 rounded-2xl border p-3'>
      {children}
    </div>
  );
  const arrow = (
    <ArrowRight
      className='text-muted-foreground size-4 shrink-0'
      aria-hidden='true'
    />
  );

  const account = (
    <span
      className='bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5'
      aria-hidden='true'
    >
      <Landmark />
    </span>
  );

  if (kind === 'pair') {
    if (subject.fromName === null || subject.toName === null) return null;
    return frame(
      <>
        <Side mark={account} name={subject.fromName} line={amount} />
        {arrow}
        <Side mark={account} name={subject.toName} />
      </>,
    );
  }
  if (kind === 'autoMark') {
    if (subject.toName === null) return null;
    return frame(
      <>
        <Side
          mark={<ItemBadge name={subject.toName} emoji={subject.toEmoji} />}
          name={subject.toName}
        />
        <CircleCheck
          className='text-primary size-5 shrink-0'
          aria-hidden='true'
        />
      </>,
    );
  }
  if (kind === 'ended') {
    if (subject.toName === null) return null;
    return frame(
      <>
        <Side
          mark={<ItemBadge name={subject.toName} emoji={subject.toEmoji} />}
          name={subject.toName}
        />
        <Flag
          className='text-muted-foreground size-5 shrink-0'
          aria-hidden='true'
        />
      </>,
    );
  }
  if (subject.merchant === null) return null;
  return frame(
    <>
      <Side
        mark={
          <PurchaseMark
            logo={subject.merchantLogo}
            name={subject.merchant}
            emoji={destination === null ? subject.toEmoji : null}
          />
        }
        name={subject.merchant}
        line={amount}
      />
      {destination !== null && (
        <>
          {arrow}
          {destination}
        </>
      )}
    </>,
  );
}

export default DoneForYouHero;
