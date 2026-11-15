import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Pencil, Trash2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import ConnectionFields from '@apps/helm/components/who/ConnectionFields';
import ConnectionPersonPicker from '@apps/helm/components/who/ConnectionPersonPicker';
import { HELM_COPY } from '@apps/helm/constants';
import {
  CONNECTION_KINDS,
  genderOf,
  readFromSide,
  type ConnectionGenders,
  type ConnectionWords,
} from '@apps/helm/engine/connections';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  addConnection,
  removeConnection,
  restoreConnection,
  setConnectionWords,
  updateConnection,
  type ConnectionResult,
} from '@apps/helm/store/actions/connectionActions';
import { selectShownConnections } from '@apps/helm/store/selectors/connectionSelectors';
import type {
  ConnectionKind,
  CoupleStatus,
  KinKind,
  OpenWho,
} from '@apps/helm/types';
import {
  STATUS_OPTIONS,
  toConnectionSentence,
} from '@apps/helm/utils/connectionText';

export type ConnectionTarget = { kind: 'add' } | { kind: 'row'; id: string };

interface ConnectionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  who: OpenWho;
  target: ConnectionTarget | null;
}

interface BodyProps {
  who: OpenWho;
  target: ConnectionTarget;
  onClose: () => void;
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const KIND_OPTIONS = CONNECTION_KINDS.map((kind) => ({
  value: kind,
  label: HELM_COPY.connectionKinds[kind],
}));

const toGenders = (...people: OpenWho[]): ConnectionGenders =>
  Object.fromEntries(people.map((person) => [person.id, genderOf(person)]));

const toKinWord = (relation: string | null) =>
  relation === null || relation === 'friend' || relation === 'coworker'
    ? null
    : (relation as KinKind);

function AddBody({
  who,
  onClose,
  requestClose,
  onDirtyChange,
}: Omit<BodyProps, 'target'>) {
  const { user } = useAuth();
  const people = useAppSelector((state) => state.helm.who.items);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [kind, setKind] = useState<ConnectionKind>('family');
  const [word, setWord] = useState<KinKind | null>(null);
  const [status, setStatus] = useState<CoupleStatus | null>(null);
  const [since, setSince] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const other = people.find((entry) => entry.id === otherId) ?? null;
  const others = people
    .filter(
      (entry) => entry.id !== who.id && !entry.isSelf && !entry.isUnreadable,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const toNote = (result: Exclude<ConnectionResult, 'saved' | 'unreadable'>) =>
    result === 'offline'
      ? HELM_COPY.editNeedsConnection
      : result === 'missing'
        ? HELM_COPY.editGone
        : HELM_COPY.connectionDuplicate(other?.name ?? '');

  const save = async () => {
    if (isBusy) return;
    if (!user || !other) {
      setNote(HELM_COPY.connectionNeedsPerson);
      return;
    }
    setIsBusy(true);
    setNote(null);
    try {
      const result = await addConnection(
        user.uid,
        await getHelmEncryption(user.uid),
        {
          firstId: other.id,
          secondId: who.id,
          kind,
          relationOfFirstToSecond: kind === 'family' ? word : null,
          status: kind === 'couple' ? status : null,
          since: kind === 'couple' ? (fromDateInputValue(since) ?? null) : null,
          genders: toGenders(who, other),
        },
      );
      if (result === 'saved') {
        onDirtyChange(false);
        onClose();
        return;
      }
      setNote(toNote(result));
    } catch (error) {
      console.error('Helm connection was not saved', error);
      setNote(HELM_COPY.editFailed);
    }
    setIsBusy(false);
  };

  if (!other)
    return (
      <div className='space-y-3'>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.connectionPickLead(who.name)}
        </p>
        <ConnectionPersonPicker
          people={others}
          onPick={(id) => {
            setOtherId(id);
            onDirtyChange(true);
          }}
        />
      </div>
    );

  return (
    <div className='space-y-4'>
      <div className='min-w-0'>
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.connectionPicked}
        </p>
        <PrivateTitle
          kind='who'
          record={other}
          className='text-[17px] font-medium'
        >
          {other.name}
        </PrivateTitle>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='-ml-2'
          disabled={isBusy}
          onClick={() => {
            setOtherId(null);
            setNote(null);
          }}
        >
          {HELM_COPY.connectionPickAgain}
        </Button>
      </div>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.connectionKindField}
        </span>
        <PillGroup
          label={HELM_COPY.connectionKindField}
          isThin
          wrapsNarrow
          options={KIND_OPTIONS}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setNote(null);
          }}
        />
      </div>
      <ConnectionFields
        kind={kind}
        name={who.name}
        otherName={other.name}
        word={word}
        status={status}
        since={since}
        onWordChange={setWord}
        onStatusChange={setStatus}
        onSinceChange={setSince}
      />
      <ModalFooterActions
        note={note}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            disabled={isBusy}
            onClick={requestClose}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isBusy} onClick={() => void save()}>
            {HELM_COPY.connectionSave}
          </Button>
        }
      />
    </div>
  );
}

function RowBody({
  who,
  target,
  onClose,
  onDirtyChange,
}: Omit<BodyProps, 'requestClose' | 'target'> & {
  target: { kind: 'row'; id: string };
}) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const people = useAppSelector((state) => state.helm.who.items);
  const connections = useAppSelector(selectShownConnections);
  const connection = connections.find((entry) => entry.id === target.id);
  const side = connection ? readFromSide(connection, who.id) : null;
  const other = people.find((entry) => entry.id === side?.otherId) ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [word, setWord] = useState<KinKind | null>(
    toKinWord(side?.relation ?? null),
  );
  const [status, setStatus] = useState<CoupleStatus | null>(
    side?.status ?? null,
  );
  const [since, setSince] = useState(
    toDateInputValue(side?.since ?? undefined),
  );
  const [note, setNote] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isStatusBusy, setIsStatusBusy] = useState(false);
  const [undo, setUndo] = useState<ConnectionWords | null>(null);

  if (!connection || !side || !other)
    return (
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.connectionLinkGone}
      </p>
    );

  const genders = toGenders(who, other);
  const toNote = (result: ConnectionResult) =>
    result === 'offline'
      ? HELM_COPY.editNeedsConnection
      : result === 'missing'
        ? HELM_COPY.connectionLinkGone
        : HELM_COPY.editUnreadable;

  const changeStatus = async (next: CoupleStatus) => {
    if (!user || isStatusBusy || next === side.status) return;
    setIsStatusBusy(true);
    setNote(null);
    try {
      const { result, before } = await updateConnection(
        user.uid,
        await getHelmEncryption(user.uid),
        connection.id,
        { status: next, genders },
      );
      if (result === 'saved') setUndo(before);
      else setNote(toNote(result));
    } catch (error) {
      console.error('Helm connection status was not saved', error);
      setNote(HELM_COPY.editFailed);
    }
    setIsStatusBusy(false);
  };

  const undoStatus = async () => {
    if (!user || !undo || isStatusBusy) return;
    setIsStatusBusy(true);
    try {
      const result = await setConnectionWords(
        user.uid,
        await getHelmEncryption(user.uid),
        connection.id,
        undo,
      );
      if (result === 'saved') setUndo(null);
      else setNote(toNote(result));
    } catch (error) {
      console.error('Helm connection status was not put back', error);
      setNote(HELM_COPY.editFailed);
    }
    setIsStatusBusy(false);
  };

  const saveChange = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setNote(null);
    try {
      const { result } = await updateConnection(
        user.uid,
        await getHelmEncryption(user.uid),
        connection.id,
        {
          ...(connection.kind === 'family'
            ? { relation: { fromId: other.id, word } }
            : {}),
          ...(connection.kind === 'couple'
            ? { status, since: fromDateInputValue(since) ?? null }
            : {}),
          genders,
        },
      );
      if (result === 'saved') {
        onDirtyChange(false);
        onClose();
        return;
      }
      setNote(toNote(result));
    } catch (error) {
      console.error('Helm connection was not saved', error);
      setNote(HELM_COPY.editFailed);
    }
    setIsBusy(false);
  };

  const remove = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setNote(null);
    try {
      const removed = await removeConnection(user.uid, connection.id);
      if (!removed) {
        setNote(HELM_COPY.connectionLinkGone);
        setIsBusy(false);
        return;
      }
      onClose();
      addToast({
        title: HELM_COPY.connectionRemovedToast(other.name),
        type: 'info',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void restoreConnection(user.uid, removed).then(
              (outcome) =>
                addToast({
                  title:
                    outcome === 'restored'
                      ? HELM_COPY.connectionRestoredToast(other.name)
                      : HELM_COPY.connectionRestoreExists,
                  type: 'info',
                }),
              (error: unknown) => {
                console.error('Helm connection was not restored', error);
                addToast({ title: HELM_COPY.editFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      console.error('Helm connection was not removed', error);
      setNote(HELM_COPY.editFailed);
      setIsBusy(false);
    }
  };

  if (isEditing)
    return (
      <div className='space-y-4'>
        <ConnectionFields
          kind={connection.kind}
          name={who.name}
          otherName={other.name}
          word={word}
          status={status}
          since={since}
          onWordChange={(next) => {
            setWord(next);
            onDirtyChange(true);
          }}
          onStatusChange={(next) => {
            setStatus(next);
            onDirtyChange(true);
          }}
          onSinceChange={(next) => {
            setSince(next);
            onDirtyChange(true);
          }}
        />
        <ModalFooterActions
          note={note}
          cancelAction={
            <Button
              type='button'
              variant='tertiary'
              disabled={isBusy}
              onClick={() => {
                setWord(toKinWord(side.relation));
                setStatus(side.status);
                setSince(toDateInputValue(side.since ?? undefined));
                setNote(null);
                onDirtyChange(false);
                setIsEditing(false);
              }}
            >
              {HELM_COPY.editCancel}
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isBusy}
              onClick={() => void saveChange()}
            >
              {HELM_COPY.connectionSaveChange}
            </Button>
          }
        />
      </div>
    );

  return (
    <div className='space-y-4'>
      <div className='min-w-0 space-y-1'>
        <PrivateTitle
          kind='who'
          record={other}
          className='text-[17px] font-medium'
        >
          {other.name}
        </PrivateTitle>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {toConnectionSentence(connection.kind, side, other.name, who.name)}
        </p>
      </div>
      {connection.kind === 'couple' && (
        <div className='space-y-1.5'>
          <PillGroup
            label={HELM_COPY.connectionStatusField}
            isThin
            wrapsNarrow
            options={STATUS_OPTIONS}
            value={side.status}
            onChange={(next) => void changeStatus(next)}
          />
          {undo && (
            <p className='text-muted-foreground flex items-center gap-2 text-[13px]'>
              <span className='min-w-0'>
                {HELM_COPY.connectionStatusChanged(
                  side.status === null
                    ? HELM_COPY.connectionPartner
                    : HELM_COPY.connectionStatuses[side.status],
                )}
              </span>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                disabled={isStatusBusy}
                onClick={() => void undoStatus()}
              >
                {HELM_COPY.undo}
              </Button>
            </p>
          )}
        </div>
      )}
      {note && <p className='text-destructive text-sm'>{note}</p>}
      <ActionGroup>
        {(connection.kind === 'family' || connection.kind === 'couple') && (
          <ActionRow
            isGrouped
            icon={<Pencil />}
            label={HELM_COPY.connectionChange}
            subtitle={HELM_COPY.connectionChangeSubtitle}
            hasChevron
            onClick={() => setIsEditing(true)}
          />
        )}
        <ActionRow
          isGrouped
          isDestructive
          icon={<Trash2 />}
          label={HELM_COPY.connectionRemove}
          subtitle={HELM_COPY.connectionRemoveSubtitle}
          isDisabled={isBusy}
          onClick={() => void remove()}
        />
      </ActionGroup>
    </div>
  );
}

/** A connection's sheet: the person and kind to add one, or one row's sentence, a couple's status in one tap, Change and Remove with Undo. */
function ConnectionSheet({
  isOpen,
  onClose,
  who,
  target,
}: ConnectionSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: () => {
      setIsDirty(false);
      onClose();
    },
  });
  const close = () => {
    setIsDirty(false);
    onClose();
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={
        target?.kind === 'row'
          ? HELM_COPY.connectionTitle
          : HELM_COPY.connectionAddTitle
      }
    >
      {isOpen && target?.kind === 'add' && (
        <AddBody
          who={who}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
      {isOpen && target?.kind === 'row' && (
        <RowBody
          who={who}
          target={target}
          onClose={close}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default ConnectionSheet;
