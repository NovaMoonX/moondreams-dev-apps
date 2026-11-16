import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  ArrowUpDown,
  ArrowRight,
  ArrowUpToLine,
  CircleSlash,
  Hourglass,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import Drawer from '@/components/Drawer';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { formatDateShort } from '@/utils/formatUtils';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { HELM_COPY } from '@apps/helm/constants';
import type { ImportanceRowView } from '@apps/helm/store/selectors/importanceSelectors';

export type PlaceChoice =
  | { kind: 'first' }
  | { kind: 'pickAbove' }
  | { kind: 'canWait' }
  | { kind: 'out' }
  | { kind: 'open' };

const SEARCH_FROM = 8;

interface ImportancePlaceSheetProps {
  row: ImportanceRowView;
  /** The place in words ("First in what matters · you said Nov 1"). */
  words: string | null;
  /** The things in order other than this one, in order. */
  others: ImportanceRowView[];
  onChoose: (choice: PlaceChoice) => void;
  onClose: () => void;
}

interface PutAboveProps {
  row: ImportanceRowView;
  others: ImportanceRowView[];
  onPick: (other: ImportanceRowView) => void;
  onClose: () => void;
}

/** The overlay list "Put it above…": the things in order, each a tap that places this one just above it. */
export function PutAboveView({ row, others, onPick, onClose }: PutAboveProps) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = others.filter((other) =>
    other.name.toLowerCase().includes(needle),
  );
  return (
    <Subview
      overlay
      title={HELM_COPY.importancePutAboveTitle(row.name)}
      onClose={onClose}
      isTitleWrapped
    >
      <div className='space-y-3'>
        {others.length >= SEARCH_FROM && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={HELM_COPY.importancePutAboveSearch}
          />
        )}
        {shown.length === 0 ? (
          <p className='text-muted-foreground py-3 text-[15px]'>
            {others.length === 0
              ? HELM_COPY.importancePutAboveNone
              : HELM_COPY.importanceNoMatch}
          </p>
        ) : (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {shown.map((other) => (
              <li key={other.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                  onClick={() => onPick(other)}
                >
                  <span
                    className='text-muted-foreground w-5 shrink-0 text-center text-sm tabular-nums'
                    aria-hidden='true'
                  >
                    {other.position}
                  </span>
                  <span
                    className='w-7 shrink-0 text-center text-2xl'
                    aria-hidden='true'
                  >
                    {other.emoji}
                  </span>
                  <span className='text-foreground min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
                    {other.name}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Subview>
  );
}

/** One thing's place: where it stands, in the person's words, and the ways to move it. */
function ImportancePlaceSheet({
  row,
  words,
  others,
  onChoose,
  onClose,
}: ImportancePlaceSheetProps) {
  const isInOrder = row.group === 'inOrder';
  const isOnlyFirst =
    isInOrder &&
    row.position === 1 &&
    others.every((other) => other.position !== 1);
  const canPutAbove = others.some((other) => other.position !== 1);
  const isStillSaid =
    (isInOrder && row.position === 1) || row.group === 'canWait';
  const quote = row.place?.words ?? null;
  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={HELM_COPY.importancePlaceTitle(row.name)}
    >
      <div className='space-y-4 pb-4'>
        <div className='space-y-1.5'>
          {words && (
            <p className='text-muted-foreground text-[13px]'>{words}</p>
          )}
          {quote && row.place && (
            <p className='flex items-start gap-2 text-[15px]'>
              <SourceRing
                isConfirmed
                label={HELM_COPY.factRingSaid}
                className='mt-1.5'
              />
              <span className='min-w-0 break-words'>
                {isStillSaid
                  ? `\u201c${quote}\u201d`
                  : HELM_COPY.importanceSaidOn(
                      formatDateShort(row.place.saidAt),
                      quote,
                    )}
              </span>
            </p>
          )}
        </div>
        <ActionGroup>
          {!isOnlyFirst && (
            <ActionRow
              isGrouped
              icon={<ArrowUpToLine aria-hidden='true' />}
              label={HELM_COPY.importanceMakeFirst}
              subtitle={
                row.group === 'canWait'
                  ? HELM_COPY.importanceMakeFirstFromCanWaitNote
                  : HELM_COPY.importanceMakeFirstNote
              }
              onClick={() => onChoose({ kind: 'first' })}
            />
          )}
          {canPutAbove && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<ArrowUpDown aria-hidden='true' />}
              label={HELM_COPY.importancePutAbove}
              subtitle={HELM_COPY.importancePutAboveNote}
              onClick={() => onChoose({ kind: 'pickAbove' })}
            />
          )}
          {row.group !== 'canWait' && (
            <ActionRow
              isGrouped
              icon={<Hourglass aria-hidden='true' />}
              label={HELM_COPY.importanceCanWaitAction}
              subtitle={HELM_COPY.importanceCanWaitNote}
              onClick={() => onChoose({ kind: 'canWait' })}
            />
          )}
          {row.group !== 'notSaid' && (
            <ActionRow
              isGrouped
              icon={<CircleSlash aria-hidden='true' />}
              label={HELM_COPY.importanceTakeOut}
              subtitle={HELM_COPY.importanceTakeOutNote}
              onClick={() => onChoose({ kind: 'out' })}
            />
          )}
        </ActionGroup>
        <ActionGroup>
          <ActionRow
            isGrouped
            hasChevron
            icon={<ArrowRight aria-hidden='true' />}
            label={HELM_COPY.importanceOpenThing(row.name)}
            onClick={() => onChoose({ kind: 'open' })}
          />
        </ActionGroup>
      </div>
    </Drawer>
  );
}

export default ImportancePlaceSheet;
