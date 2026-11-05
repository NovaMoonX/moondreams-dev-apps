import { useState } from 'react';
import { Unlink } from 'lucide-react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { unlinkLink } from '@apps/runway/store/actions/linkActions';
import { moveDownFromLink } from '@apps/runway/store/actions/planActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  formatUpdatedAgo,
  isLiveLink,
  isUnlinkedLink,
} from '@apps/runway/utils/linkText';

interface BankSheetProps {
  linkId: string;
  onClose: () => void;
}

const toRowLabel = (row: { name: string; mask: string | null }) =>
  `${row.name}${row.mask ? ` ••${row.mask}` : ''}`;

/** One linked bank: what it brought in and, while it is linked, Unlink. Unlinking the last bank moves the plan from Link to Track. */
function BankSheet({ linkId, onClose }: BankSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const now = useNow(60_000);
  const link = useAppSelector(
    (state) => state.runway.links.find((entry) => entry.id === linkId) ?? null,
  );
  const level = useAppSelector(selectLevel);
  const hasOtherLiveLink = useAppSelector((state) =>
    state.runway.links.some(
      (entry) => entry.id !== linkId && isLiveLink(entry),
    ),
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!link) return null;

  const isUnlinked = isUnlinkedLink(link);
  const isLevelStuck = isUnlinked && level === 'link' && !hasOtherLiveLink;
  const isLastBank = level === 'link' && !hasOtherLiveLink;
  const broughtIn = link.providerAccounts.filter((row) => !row.isSkipped);
  const leftOut = link.providerAccounts.filter((row) => row.isSkipped);

  const unlink = async () => {
    if (!user || isBusy) return;
    const isConfirmed = isLevelStuck
      ? true
      : await confirm({
          title: LINK_WORDS.unlinkTitle(link.institutionName),
          message: (
            <div className='space-y-3 text-left'>
              <p>{LINK_WORDS.unlinkMessage(link.institutionName)}</p>
              <ul className='list-disc space-y-1 pl-5'>
                {broughtIn.map((row) => (
                  <li key={row.providerAccountId}>{toRowLabel(row)}</li>
                ))}
              </ul>
              {isLastBank && <p>{LINK_WORDS.unlinkLevelMessage}</p>}
            </div>
          ),
          confirmText: LINK_WORDS.unlinkConfirm,
          destructive: true,
        });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      await unlinkLink(link.id);
    } catch (unlinkError) {
      setError(getErrorMessage(unlinkError, LINK_WORDS.unlinkFailed));
      setIsBusy(false);
      return;
    }
    try {
      const stillLinked = store
        .getState()
        .runway.links.some(
          (entry) => entry.id !== link.id && isLiveLink(entry),
        );
      if (!stillLinked && selectLevel(store.getState()) === 'link') {
        const encryption = await getRunwayEncryption(user.uid);
        await moveDownFromLink(user.uid, encryption, link.institutionName);
      }
    } catch {
      setError(LINK_WORDS.unlinkLevelFailed);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <DetailSheet isOpen onClose={onClose} title={link.institutionName}>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          {isUnlinked
            ? LINK_WORDS.unlinkedNote
            : LINK_WORDS.linkedRowValue(
                broughtIn.length,
                formatUpdatedAgo(link.lastSyncAt ?? link.createdAt, now),
              )}
        </p>
        <section className='space-y-2'>
          <h3 className='text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase'>
            {LINK_WORDS.sheetAccounts}
          </h3>
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {broughtIn.map((row) => (
              <li
                key={row.providerAccountId}
                className='p-3 text-sm break-words'
              >
                {toRowLabel(row)}
              </li>
            ))}
          </ul>
          {leftOut.length > 0 && (
            <p className='text-muted-foreground px-1 text-sm break-words'>
              {LINK_WORDS.sheetLeftOut}: {leftOut.map(toRowLabel).join(', ')}
            </p>
          )}
        </section>
        {(!isUnlinked || isLevelStuck) && (
          <div className='space-y-2'>
            <ActionRow
              isRoomy
              isDestructive
              icon={<Unlink />}
              label={LINK_WORDS.unlink}
              subtitle={LINK_WORDS.unlinkHelp}
              isDisabled={isBusy}
              onClick={() => void unlink()}
            />
          </div>
        )}
        {isUnlinked && !isLevelStuck && (
          <p className='text-muted-foreground text-sm'>
            {LINK_WORDS.relinkHelp}
          </p>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
    </DetailSheet>
  );
}

export default BankSheet;
