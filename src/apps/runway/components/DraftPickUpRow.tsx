import { useState, useSyncExternalStore } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, FilePen, X } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import {
  listKeptSealedFormDrafts,
  subscribeKeptFormDrafts,
} from '@/lib/app/formDrafts';
import {
  DRAFT_PICK_UP_KEYS,
  DRAFT_PICK_UP_WORDS,
  FORM_DRAFT_PREFIX,
} from '@apps/runway/constants';
import type { DRAFT_PICK_UP_KINDS } from '@apps/runway/constants';
import { selectHasEverHadIncome } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

type DraftKind = (typeof DRAFT_PICK_UP_KINDS)[number];

const TRACK_ONLY_KINDS: readonly DraftKind[] = ['purchase', 'card'];
const AFTER_INCOME_KINDS: readonly DraftKind[] = [
  'bill',
  'envelope',
  'goal',
  'card',
];
// Dismissed until the app reloads, whichever screen unmounts the row meanwhile.
const dismissal = { isHidden: false };

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
  const { showAddOnTab } = useRunwayUrlState();
  const [isHidden, setIsHidden] = useState(dismissal.isHidden);
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  const uid = user?.uid ?? null;
  // A string snapshot, so the store's answer compares equal until the kept set really changes.
  const keptKeys = useSyncExternalStore(subscribeKeptFormDrafts, () =>
    uid === null
      ? ''
      : listKeptSealedFormDrafts(uid, FORM_DRAFT_PREFIX).join('\n'),
  );
  const kind = isHidden
    ? undefined
    : keptKeys
        .split('\n')
        .flatMap((key) => {
          const found: DraftKind | undefined = DRAFT_PICK_UP_KEYS[key];
          return found === undefined ? [] : [found];
        })
        .find(
          (found) =>
            (isTrack || !TRACK_ONLY_KINDS.includes(found)) &&
            (hasIncome || !AFTER_INCOME_KINDS.includes(found)),
        );

  if (kind === undefined) return null;

  const noun = DRAFT_PICK_UP_WORDS.nouns[kind];
  const pickUp = () => {
    if (kind === 'purchase') return onPickUpPurchase();
    if (kind === 'expense' || kind === 'expectedIncome')
      return void showAddOnTab(kind, 'days');
    return void showAddOnTab(kind, 'plan', PLAN_SECTION_BY_KIND[kind]);
  };

  return (
    <section
      aria-label={DRAFT_PICK_UP_WORDS.title(noun)}
      className='bg-card border-border flex min-h-12 items-stretch rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-muted/60 h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-3! py-1! text-left max-[359px]:gap-2 max-[359px]:px-2!'
        onClick={pickUp}
      >
        <FilePen
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
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
        className='text-muted-foreground! mr-1 size-10 min-w-10 shrink-0 self-center rounded-full p-0'
        onClick={() => {
          dismissal.isHidden = true;
          setIsHidden(true);
        }}
      >
        <X className='h-5 w-5' aria-hidden='true' />
      </Button>
    </section>
  );
}

export default DraftPickUpRow;
