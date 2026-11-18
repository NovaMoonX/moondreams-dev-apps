import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import { toComparable } from '@/utils/optionMatchUtils';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import WhoMark from '@apps/helm/components/who/WhoMark';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenWho } from '@apps/helm/types';
import { getWhoLine } from '@apps/helm/utils/whoGroups';

const SEARCH_FROM = 8;
const EAGER_ROWS = 20;
const ROW_HEIGHT = 64;

interface ConnectionPersonPickerProps {
  people: OpenWho[];
  onPick: (whoId: string) => void;
}

/** The other people to connect with, searchable from 8 rows; a tap picks one. */
function ConnectionPersonPicker({
  people,
  onPick,
}: ConnectionPersonPickerProps) {
  const [search, setSearch] = useState('');
  const query = toComparable(search);
  const shown = useMemo(
    () =>
      query === ''
        ? people
        : people.filter((who) =>
            toComparable(`${who.name} ${who.aliases.join(' ')}`).includes(
              query,
            ),
          ),
    [people, query],
  );

  if (people.length === 0)
    return (
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.connectionNobodyElse}
      </p>
    );

  return (
    <div className='space-y-3'>
      {people.length >= SEARCH_FROM && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={HELM_COPY.connectionSearch}
        />
      )}
      {shown.length === 0 ? (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.connectionNoMatch}
        </p>
      ) : (
        <div className='helm-card divide-border divide-y overflow-hidden'>
          {shown.map((who, index) => {
            const line = getWhoLine(who, {
              you: HELM_COPY.youLabel,
              pet: HELM_COPY.petKindFallback,
              organization: HELM_COPY.organizationKindFallback,
            });
            return (
              <LazyMount
                key={who.id}
                estimatedHeight={ROW_HEIGHT}
                eager={index < EAGER_ROWS}
              >
                <Button
                  type='button'
                  variant='tertiary'
                  className='flex h-auto min-h-16 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-2 text-left focus-visible:-outline-offset-2'
                  onClick={() => onPick(who.id)}
                >
                  <WhoMark kind={who.kind} name={who.name} />
                  <span className='min-w-0 flex-1'>
                    <PrivateTitle
                      kind='who'
                      record={who}
                      lines={1}
                      className='text-foreground text-[15px]'
                    >
                      {who.name}
                    </PrivateTitle>
                    {line && (
                      <span className='text-muted-foreground block truncate text-[13px]'>
                        {line}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </LazyMount>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConnectionPersonPicker;
