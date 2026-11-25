import { useState } from 'react';

import BackHeading from '@/components/BackHeading';
import SearchInput from '@/components/SearchInput';
import { useAppSelector } from '@/store';
import { useFromSpendCandidates } from '@apps/runway/hooks/useFromSpendCandidates';
import NeedsHomeAssign from '@apps/runway/components/NeedsHomeAssign';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import {
  FROM_SPEND_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

interface FromSpendViewProps {
  envelopeId: string;
  envelopeName: string;
  today: number;
  onBack: () => void;
  onDone: () => void;
}

/** Puts a charge already in Spend into this envelope: pick the charge, then see what it leaves and send it. */
function FromSpendView({
  envelopeId,
  envelopeName,
  today,
  onBack,
  onDone,
}: FromSpendViewProps) {
  const candidates = useFromSpendCandidates(today);
  const looks = useAppSelector(selectItemLooks);
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const nameOf = (id: string) => looks.get(id)?.name ?? '';
  const picked = candidates.find((entry) => entry.id === pickedId) ?? null;

  if (picked) {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <BackHeading
          onBack={() => setPickedId(null)}
          title={FROM_SPEND_WORDS.sendTitle(envelopeName)}
        />
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          <PurchaseRow purchase={picked} looks={looks} />
        </ul>
        <NeedsHomeAssign
          purchase={picked}
          envelopeId={envelopeId}
          onDone={onDone}
        />
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const rows =
    needle === ''
      ? candidates
      : candidates.filter((purchase) =>
          getPurchaseTitle(purchase, nameOf).toLowerCase().includes(needle),
        );
  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackHeading onBack={onBack} title={FROM_SPEND_WORDS.title} />
      {candidates.length >= RUNWAY_SEARCH_THRESHOLD && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={FROM_SPEND_WORDS.search}
        />
      )}
      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {candidates.length === 0
            ? FROM_SPEND_WORDS.empty
            : FROM_SPEND_WORDS.noMatch}
        </p>
      ) : (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {rows.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              looks={looks}
              onOpen={() => setPickedId(purchase.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default FromSpendView;
