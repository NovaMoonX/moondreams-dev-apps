import { useMemo, useState, useSyncExternalStore } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, FilePen, X } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import {
  getKeptFormDraftsVersion,
  listKeptSealedFormDrafts,
  subscribeKeptFormDrafts,
} from '@/lib/app/formDrafts';
import {
  DRAFT_PICK_UP_KEYS,
  DRAFT_PICK_UP_WORDS,
  FORM_DRAFT_PREFIX,
} from '@apps/runway/constants';
import type { DRAFT_PICK_UP_KINDS } from '@apps/runway/constants';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

type DraftKind = (typeof DRAFT_PICK_UP_KINDS)[number];

const PLAN_SECTION_BY_KIND = {
  bill: 'bills',
  envelope: 'envelopes',
  goal: 'goals',
  income: 'income',
  card: 'cards',
} as const;

interface DraftPickUpRowProps {
  isTrack: boolean;
  onPickUpPurchase: () => void;
}

/** Offers back a new item's unsaved form the system closed, on Home. Reads only which form has a draft, never what is in it. */
function DraftPickUpRow({ isTrack, onPickUpPurchase }: DraftPickUpRowProps) {
  const { user } = useAuth();
  const { requestAdd, showTab, showPlanSection } = useRunwayUrlState();
  const [isHidden, setIsHidden] = useState(false);
  const version = useSyncExternalStore(
    subscribeKeptFormDrafts,
    getKeptFormDraftsVersion,
  );
  const uid = user?.uid ?? null;
  const kinds = useMemo(
    () =>
      uid === null
        ? []
        : listKeptSealedFormDrafts(uid, FORM_DRAFT_PREFIX).flatMap((key) => {
            const found: DraftKind | undefined = DRAFT_PICK_UP_KEYS[key];
            return found === undefined ? [] : [found];
          }),
    // The kept set is read from a store outside React; its version says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, version],
  );
  const kind = isHidden
    ? undefined
    : kinds.find((found) => isTrack || found !== 'purchase');

  if (kind === undefined) return null;

  const noun = DRAFT_PICK_UP_WORDS.nouns[kind];
  const pickUp = () => {
    if (kind === 'purchase') return onPickUpPurchase();
    requestAdd(kind);
    if (kind === 'expense' || kind === 'expectedIncome') return showTab('days');
    showPlanSection(PLAN_SECTION_BY_KIND[kind]);
    return showTab('plan');
  };

  return (
    <section
      aria-label={DRAFT_PICK_UP_WORDS.title(noun)}
      className='bg-accent/60 border-border flex min-h-12 items-stretch rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-accent h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-3! py-1! text-left max-[359px]:gap-2 max-[359px]:px-2!'
        onClick={pickUp}
      >
        <FilePen className='h-5 w-5 shrink-0' aria-hidden='true' />
        <span className='text-foreground min-w-0 flex-1 text-sm leading-5 font-medium'>
          {DRAFT_PICK_UP_WORDS.title(noun)}
        </span>
        <ChevronRight
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        aria-label={DRAFT_PICK_UP_WORDS.dismiss}
        title={DRAFT_PICK_UP_WORDS.dismiss}
        className='text-foreground! mr-1 size-10 min-w-10 shrink-0 self-center rounded-full p-0'
        onClick={() => setIsHidden(true)}
      >
        <X className='h-5 w-5' aria-hidden='true' />
      </Button>
    </section>
  );
}

export default DraftPickUpRow;
