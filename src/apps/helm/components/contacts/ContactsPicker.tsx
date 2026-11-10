import { useMemo, useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FallbackImage from '@/components/FallbackImage';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SelectionBar from '@/components/SelectionBar';
import Subview from '@/components/Subview';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import type { ConnectorOption } from '@/lib/connections/contract';
import { useAppSelector } from '@/store';
import { toComparable } from '@/utils/optionMatchUtils';
import WhoMark from '@apps/helm/components/who/WhoMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useContactsReport } from '@apps/helm/hooks/useContactsReport';
import {
  CONTACTS_PER_CALL,
  CONTACTS_SHOWN_MAX,
  readContactsFailure,
  useContactOptions,
  useImportContacts,
} from '@apps/helm/queries/contactsQueries';

const EAGER_ROWS = 20;
const ROW_HEIGHT = 64;

interface ContactsPickerProps {
  accountId: string | null;
  onClose: () => void;
  onReconnect: (accountId: string) => void;
}

interface ContactRowProps {
  option: ConnectorOption;
  isIn: boolean;
  isTicked: boolean;
  isFull: boolean;
  onToggle: (id: string) => void;
}

function ContactRow({
  option,
  isIn,
  isTicked,
  isFull,
  onToggle,
}: ContactRowProps) {
  const mark = <WhoMark kind='person' name={option.name} />;
  return (
    <div className='border-border border-b last:border-b-0'>
      <label className='flex min-h-16 items-center gap-3 px-4 py-2'>
        <Checkbox
          checked={isTicked}
          disabled={isIn || (isFull && !isTicked)}
          onCheckedChange={() => onToggle(option.id)}
          aria-label={option.name}
        />
        {option.photoUrl ? (
          <FallbackImage
            src={option.photoUrl}
            alt=''
            className='size-10 shrink-0 rounded-full object-cover'
            fallback={mark}
          />
        ) : (
          mark
        )}
        <span className='min-w-0 flex-1'>
          <span className='line-clamp-2 text-[15px] break-words'>
            {option.name}
          </span>
          <span className='text-muted-foreground block truncate text-[13px]'>
            {isIn ? HELM_COPY.contactsAlreadyIn : option.detail}
          </span>
        </span>
      </label>
    </div>
  );
}

/** Lists one account's contacts, read when this opens and kept only in memory, and brings in the ones ticked. */
function ContactsPicker({
  accountId,
  onClose,
  onReconnect,
}: ContactsPickerProps) {
  const assistant = useAssistantName();
  const { addToast } = useToast();
  const { reportDone, toFailureLine } = useContactsReport();
  const contacts = useContactOptions(accountId);
  const isOffline = useNetworkStatus() === 'offline';
  const who = useAppSelector((state) => state.helm.who.items);
  const [search, setSearch] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const importContacts = useImportContacts({
    onSuccess: (result) => {
      reportDone(result, HELM_COPY.contactsAllIn);
      onClose();
    },
    onError: (error) => {
      console.error('Helm contacts were not brought in', error);
      const line = toFailureLine(error, HELM_COPY.contactsImportFailed);
      if (line === null) setNeedsReconnect(true);
      else addToast({ title: line, type: 'error' });
    },
  });

  const alreadyIn = useMemo(
    () =>
      new Set(
        who.flatMap((entry) =>
          entry.importedFrom && entry.importedFrom.accountId === accountId
            ? [entry.importedFrom.resourceName]
            : [],
        ),
      ),
    [who, accountId],
  );
  const options = useMemo(
    () =>
      [...(contacts.data ?? [])].sort(
        (a, b) => Number(alreadyIn.has(a.id)) - Number(alreadyIn.has(b.id)),
      ),
    [contacts.data, alreadyIn],
  );
  const isCapped = options.length >= CONTACTS_SHOWN_MAX;
  const isEveryoneIn =
    options.length > 0 && options.every((option) => alreadyIn.has(option.id));
  const query = toComparable(search);
  const shown = useMemo(
    () =>
      query === ''
        ? options
        : options.filter((option) =>
            toComparable(`${option.name} ${option.detail ?? ''}`).includes(
              query,
            ),
          ),
    [options, query],
  );
  const isFull = ticked.length >= CONTACTS_PER_CALL;
  const isReconnect =
    needsReconnect ||
    (contacts.isError &&
      readContactsFailure(contacts.error) !== null &&
      readContactsFailure(contacts.error) !== 'goneAtGoogle');

  const toggle = (id: string) =>
    setTicked((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const bringIn = () => {
    if (accountId === null || ticked.length === 0) return;
    importContacts.mutate({ accountId, resourceNames: ticked });
  };

  const renderBody = () => {
    if (isReconnect && accountId !== null)
      return (
        <div className='flex flex-col items-start gap-3'>
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.contactsReconnect}
          </p>
          <Button type='button' onClick={() => onReconnect(accountId)}>
            {HELM_COPY.contactsReconnectAction}
          </Button>
        </div>
      );
    if (isOffline && contacts.data === undefined)
      return (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.contactsNeedConnection}
        </p>
      );
    if (contacts.isError)
      return (
        <div className='flex flex-col items-start gap-3'>
          <p className='text-destructive text-[15px] text-pretty' role='alert'>
            {HELM_COPY.contactsFailed}
          </p>
          <Button
            type='button'
            variant='secondary'
            onClick={() => void contacts.refetch()}
          >
            {HELM_COPY.contactsTryAgain}
          </Button>
        </div>
      );
    if (contacts.isPending)
      return (
        <p className='text-muted-foreground text-[15px]' role='status'>
          {HELM_COPY.contactsLoading}
        </p>
      );
    if (options.length === 0)
      return (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.contactsEmpty}
        </p>
      );
    if (isEveryoneIn)
      return (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.contactsEveryoneIn}
        </p>
      );
    return (
      <>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={HELM_COPY.contactsSearch}
        />
        {shown.length === 0 ? (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.contactsNoMatch}
          </p>
        ) : (
          <div className='helm-card overflow-hidden'>
            {shown.map((option, index) => (
              <LazyMount
                key={option.id}
                estimatedHeight={ROW_HEIGHT}
                eager={index < EAGER_ROWS}
              >
                <ContactRow
                  option={option}
                  isIn={alreadyIn.has(option.id)}
                  isTicked={ticked.includes(option.id)}
                  isFull={isFull}
                  onToggle={toggle}
                />
              </LazyMount>
            ))}
          </div>
        )}
        {isCapped && (
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.contactsCapped}
          </p>
        )}
      </>
    );
  };

  return (
    <Subview overlay title={HELM_COPY.contactsTitle} onClose={onClose}>
      <div className='flex flex-col gap-4'>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.contactsLead(assistant)}
        </p>
        {renderBody()}
      </div>
      <SelectionBar
        actions={[]}
        note={isFull ? HELM_COPY.contactsTooMany(CONTACTS_PER_CALL) : null}
        primary={{
          key: 'bring-in',
          label: HELM_COPY.contactsPick(ticked.length),
          onClick: bringIn,
          isDisabled: ticked.length === 0 || isReconnect || isOffline,
          isLoading: importContacts.isPending,
        }}
      />
    </Subview>
  );
}

export default ContactsPicker;
