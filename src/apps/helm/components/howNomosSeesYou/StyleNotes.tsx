import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Plus } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import AppToggle from '@/components/AppToggle';
import HelpTip from '@/components/HelpTip';
import InlineNotice from '@/components/InlineNotice';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import {
  HELM_COPY,
  STYLE_AVOID_LIMIT,
  STYLE_AVOID_MAX,
  STYLE_TRAIT_LIMIT,
  STYLE_TRAIT_MAX,
} from '@apps/helm/constants';
import {
  addStyleTrait,
  editStyleAvoid,
  editStyleTrait,
  GENERAL_STYLE_ID,
  removeStyleAvoid,
  removeMailStyles,
  removeStyleTrait,
  type StyleResult,
} from '@apps/helm/queries/styleMutations';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { learnMailStyle } from '@apps/helm/queries/mailStyleLearning';
import type { OpenStyle } from '@apps/helm/store/listeners/styleListener';

type Target =
  | { kind: 'add' }
  | {
      kind: 'trait';
      styleId: string;
      key: string;
      text: string;
      source: string;
    }
  | { kind: 'avoid'; styleId: string; text: string; source: string };

const getTraitSource = (
  trait: { isPersonSet: boolean; exampleCount: number },
  isFromMail: boolean,
) =>
  trait.isPersonSet
    ? trait.exampleCount === 0
      ? HELM_COPY.styleAddedByYou
      : HELM_COPY.styleEditedByYou
    : isFromMail
      ? HELM_COPY.styleMailSeenIn(trait.exampleCount)
      : HELM_COPY.styleSeenIn(trait.exampleCount);

const isMailStyle = (entry: OpenStyle) =>
  entry.learnedFrom.includes('sentMail');

/** Work and personal first, then the people, A to Z. */
const getMailGroups = (items: OpenStyle[]) =>
  items
    .filter((entry) => isMailStyle(entry) && !entry.isUnreadable)
    .sort(
      (a, b) =>
        Number(a.scope === 'audience') - Number(b.scope === 'audience') ||
        (a.scope === 'audience'
          ? a.label.localeCompare(b.label)
          : b.id.localeCompare(a.id)),
    );

interface NoteSheetProps {
  target: Target | null;
  onClose: () => void;
}

const getFailureTitle = (kind: 'full' | 'fullAvoid' | 'gone' | 'offline') =>
  kind === 'full'
    ? HELM_COPY.styleFull(STYLE_TRAIT_LIMIT)
    : kind === 'fullAvoid'
      ? HELM_COPY.styleAvoidFull(STYLE_AVOID_LIMIT)
      : kind === 'gone'
        ? HELM_COPY.styleGone
        : HELM_COPY.factNeedsConnection;

function NoteSheet({ target, onClose }: NoteSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [isEditing, setIsEditing] = useState(target?.kind === 'add');
  const [text, setText] = useState(
    target?.kind === 'add' ? '' : (target?.text ?? ''),
  );
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isAvoid = target?.kind === 'avoid';
  const isMissing = text.trim() === '';

  const report = (result: StyleResult, doneTitle: string) => {
    if (result.kind === 'done') {
      const { undo } = result;
      onClose();
      addToast({
        title: doneTitle,
        type: 'success',
        action: undo
          ? {
              label: HELM_COPY.undo,
              onClick: () =>
                void undo()
                  .then((undone) => {
                    if (undone.kind !== 'done') {
                      addToast({
                        title: HELM_COPY.styleUndoneFailed,
                        type: 'info',
                      });
                    }
                  })
                  .catch((error: unknown) => {
                    console.error('Helm writing note was not put back', error);
                    addToast({ title: HELM_COPY.editFailed, type: 'error' });
                  }),
            }
          : undefined,
      });
      return;
    }
    setIsSaving(false);
    addToast({
      title: getFailureTitle(result.kind),
      type: 'info',
    });
  };

  const run = async (
    act: (uid: string) => Promise<StyleResult>,
    doneTitle: string,
  ) => {
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      report(await act(user.uid), doneTitle);
    } catch (error) {
      console.error('Helm writing note was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  const save = () => {
    if (!target) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    if (target.kind === 'add') {
      void run((uid) => addStyleTrait(uid, text), HELM_COPY.styleAdded);
      return;
    }
    if (target.kind === 'trait') {
      void run(
        (uid) => editStyleTrait(uid, target.key, text, target.styleId),
        HELM_COPY.styleSaved,
      );
      return;
    }
    void run(
      (uid) => editStyleAvoid(uid, target.text, text, target.styleId),
      HELM_COPY.styleSaved,
    );
  };

  const remove = () => {
    if (!target || target.kind === 'add') return;
    void run(
      (uid) =>
        target.kind === 'trait'
          ? removeStyleTrait(uid, target.key, target.styleId)
          : removeStyleAvoid(uid, target.text, target.styleId),
      HELM_COPY.styleRemoved,
    );
  };

  return (
    <DetailSheet
      isOpen={target !== null}
      onClose={onClose}
      title={
        target?.kind === 'add'
          ? HELM_COPY.styleAddTitle
          : HELM_COPY.styleSheetTitle
      }
      footer={
        <div className='px-6 pt-2 pb-3'>
          <ModalFooterActions
            note={isTouched && isMissing ? HELM_COPY.styleMissing : null}
            cancelAction={
              <Button
                type='button'
                variant='tertiary'
                onClick={
                  isEditing && target?.kind !== 'add'
                    ? () => setIsEditing(false)
                    : onClose
                }
                disabled={isSaving}
              >
                {HELM_COPY.editCancel}
              </Button>
            }
            rightActions={
              isEditing ? (
                <Button type='button' loading={isSaving} onClick={save}>
                  {HELM_COPY.editSave}
                </Button>
              ) : (
                <>
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={isSaving}
                    onClick={remove}
                  >
                    {HELM_COPY.styleRemove}
                  </Button>
                  <Button type='button' onClick={() => setIsEditing(true)}>
                    {HELM_COPY.styleEdit}
                  </Button>
                </>
              )
            }
          />
        </div>
      }
    >
      {isEditing ? (
        <div className='space-y-1.5'>
          <label htmlFor={fieldId} className='text-sm font-medium'>
            {HELM_COPY.styleField}
          </label>
          <Input
            id={fieldId}
            value={text}
            maxLength={isAvoid ? STYLE_AVOID_MAX : STYLE_TRAIT_MAX}
            placeholder={HELM_COPY.stylePlaceholder}
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.styleHelp}
          </p>
        </div>
      ) : (
        target &&
        target.kind !== 'add' && (
          <div className='space-y-1'>
            <p className='text-[15px] break-words'>{target.text}</p>
            <p className='text-muted-foreground text-[13px]'>{target.source}</p>
          </div>
        )
      )}
    </DetailSheet>
  );
}

interface NoteListProps {
  style: OpenStyle | undefined;
  onOpen: (target: Target) => void;
}

const sortTraits = (style: OpenStyle | undefined) =>
  Object.entries(style?.traits ?? {}).sort(
    ([, a], [, b]) =>
      Number(b.isPersonSet) - Number(a.isPersonSet) ||
      b.exampleCount - a.exampleCount,
  );

function NoteList({ style, onOpen }: NoteListProps) {
  const isFromMail = style ? isMailStyle(style) : false;
  const styleId = style?.id ?? GENERAL_STYLE_ID;
  const avoidSource = style?.personEditedAt
    ? HELM_COPY.styleEditedByYou
    : HELM_COPY.styleAvoidSource;

  return (
    <ul className='helm-card divide-border divide-y overflow-hidden'>
      {sortTraits(style).map(([key, trait]) => (
        <li key={key}>
          <NoteRow
            text={trait.text}
            detail={getTraitSource(trait, isFromMail)}
            onOpen={() =>
              onOpen({
                kind: 'trait',
                styleId,
                key,
                text: trait.text,
                source: getTraitSource(trait, isFromMail),
              })
            }
          />
        </li>
      ))}
      {(style?.avoid ?? []).map((line, index) => (
        <li key={`avoid-${index}-${line}`}>
          <NoteRow
            text={line}
            detail={avoidSource}
            onOpen={() =>
              onOpen({
                kind: 'avoid',
                styleId,
                text: line,
                source: avoidSource,
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

type MailFailure =
  | 'notEnough'
  | 'nothingLearned'
  | 'busy'
  | 'failed'
  | 'offline'
  | 'needsGmail'
  | 'reconnect'
  | 'unreadable';

const MAIL_FAILURE_LINES: Record<MailFailure, string> = {
  notEnough: HELM_COPY.styleMailNotEnough,
  nothingLearned: HELM_COPY.styleMailNothingLearned,
  busy: HELM_COPY.styleMailBusy,
  failed: HELM_COPY.styleMailFailed,
  offline: HELM_COPY.styleMailOffline,
  needsGmail: HELM_COPY.styleMailNeedsGmailBody,
  reconnect: HELM_COPY.styleMailReconnect,
  unreadable: HELM_COPY.styleMailUnreadable,
};

const SERVER_REASONS: MailFailure[] = ['needsGmail', 'reconnect', 'unreadable'];

const toMailFailure = (error: unknown): MailFailure => {
  const { code, details } = error as { code?: unknown; details?: unknown };
  const reason = (details as { reason?: unknown } | null | undefined)?.reason;
  const known = SERVER_REASONS.find((entry) => entry === reason);
  if (known) return known;
  if (reason === 'noKey') return 'unreadable';
  return code === 'functions/resource-exhausted' ? 'busy' : 'failed';
};

/** The switch that learns notes from sent mail once, and removes them again. Hidden until the Gmail gate is open for the person, unless notes from mail already exist and need a way off. */
function MailSwitch({ isOn }: { isOn: boolean }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { showView } = useHelmUrlState();
  const isGateOpen = useIsGateOpen('helm', 'google-mail-and-drive');
  const { grants } = useConnections({ readerAppId: 'helm' });
  const [isWorking, setIsWorking] = useState(false);
  const [failure, setFailure] = useState<MailFailure | null>(null);
  const isConnected = grants.some(
    (grant) => grant.connectorId === 'google:gmail' && grant.status === 'live',
  );

  if (!isGateOpen && !isOn) return null;

  const turnOn = async () => {
    if (isWorking) return;
    if (!navigator.onLine) {
      setFailure('offline');
      return;
    }
    setIsWorking(true);
    setFailure(null);
    try {
      const result = await learnMailStyle();
      if (result.status !== 'learned') setFailure(result.status);
      else if (result.groups === 0) setFailure('nothingLearned');
    } catch (error) {
      console.error('Sent mail was not read', error);
      setFailure(toMailFailure(error));
    } finally {
      setIsWorking(false);
    }
  };

  const turnOff = async () => {
    if (!user || isWorking) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.styleMailOffConfirmTitle,
      message: HELM_COPY.styleMailOffConfirm,
      confirmText: HELM_COPY.styleMailOffAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsWorking(true);
    setFailure(null);
    try {
      const removed = await removeMailStyles(user.uid);
      addToast({
        title: HELM_COPY.styleMailRemoved,
        type: 'success',
        action: removed
          ? {
              label: HELM_COPY.undo,
              onClick: () =>
                void removed.undo().catch((error: unknown) => {
                  console.error('Helm mail notes were not put back', error);
                  addToast({
                    title: HELM_COPY.styleMailUndoneFailed,
                    type: 'error',
                  });
                }),
            }
          : undefined,
      });
    } catch (error) {
      console.error('Helm mail notes were not removed', error);
      addToast({ title: HELM_COPY.styleMailRemoveFailed, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  const isLocked = !isOn && !isConnected;
  const hasDoor =
    isLocked || failure === 'needsGmail' || failure === 'reconnect';
  const isNeutral = failure === 'notEnough' || failure === 'nothingLearned';

  return (
    <div className='helm-card space-y-3 p-4'>
      <div className='flex items-center gap-3'>
        <span className='min-w-0 flex-1'>
          <span className='flex items-center gap-1 text-[15px] font-medium'>
            {HELM_COPY.styleMailTitle}
            <HelpTip title={HELM_COPY.styleMailTitle} placement='top'>
              <p>{HELM_COPY.styleMailHelpTip}</p>
            </HelpTip>
          </span>
          <span className='text-muted-foreground block text-[13px] text-pretty'>
            {HELM_COPY.styleMailBody}
          </span>
        </span>
        {!isLocked && (
          <AppToggle
            aria-label={HELM_COPY.styleMailTitle}
            checked={isOn || isWorking}
            disabled={isWorking}
            onCheckedChange={(next) => void (next ? turnOn() : turnOff())}
          />
        )}
      </div>
      {isWorking && !isOn && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {HELM_COPY.styleMailReading}
        </p>
      )}
      {failure && (
        <div role='status'>
          <InlineNotice tone={isNeutral ? 'info' : 'warning'}>
            {MAIL_FAILURE_LINES[failure]}
          </InlineNotice>
        </div>
      )}
      {hasDoor && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => void showView('connectedApps')}
        >
          {failure === 'reconnect'
            ? HELM_COPY.styleMailReconnectAction
            : HELM_COPY.styleMailConnect}
        </Button>
      )}
    </div>
  );
}

/** The writing notes learned from what the person types, then those learned from sent mail by occasion and person, each opening a small sheet to edit or remove it, and a way to add one. */
function StyleNotes() {
  const items = useAppSelector((state) => state.helm.style.items);
  const isLoaded = useAppSelector((state) => state.helm.style.isLoaded);
  const [target, setTarget] = useState<Target | null>(null);
  const style = items.find(
    (entry) => entry.id === GENERAL_STYLE_ID && !entry.isUnreadable,
  );
  const isEmpty =
    Object.keys(style?.traits ?? {}).length === 0 &&
    (style?.avoid ?? []).length === 0;
  const isUnreadable = items.some(
    (entry) => entry.id === GENERAL_STYLE_ID && entry.isUnreadable,
  );
  const mailGroups = getMailGroups([...items]);
  const isMailOn = items.some(isMailStyle);

  if (!isLoaded) return null;

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={HELM_COPY.styleTitle}
        trailing={
          <>
            <HelpTip title={HELM_COPY.styleTitle} placement='top'>
              <p>{HELM_COPY.styleHelpTip}</p>
            </HelpTip>
            {!isUnreadable && (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                aria-label={HELM_COPY.styleAddLabel}
                className="relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
                onClick={() => setTarget({ kind: 'add' })}
              >
                <Plus className='size-4' aria-hidden='true' />
                {HELM_COPY.styleAdd}
              </Button>
            )}
          </>
        }
      />
      {isUnreadable ? (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.styleUnreadable}
        </p>
      ) : isEmpty ? (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.styleEmpty}
        </p>
      ) : (
        <NoteList style={style} onOpen={setTarget} />
      )}
      <MailSwitch isOn={isMailOn} />
      {mailGroups.length > 0 && (
        <SectionDivider label={HELM_COPY.styleMailGroupsTitle} />
      )}
      {mailGroups.map((group) => (
        <div key={group.id} className='space-y-1.5'>
          <h3 className='text-muted-foreground px-4 text-[13px] font-medium'>
            {group.scope === 'audience'
              ? HELM_COPY.styleMailWithWho(group.label)
              : group.label}
          </h3>
          <NoteList style={group} onOpen={setTarget} />
        </div>
      ))}
      <NoteSheet
        key={target ? JSON.stringify(target) : 'none'}
        target={target}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

interface NoteRowProps {
  text: string;
  detail?: string;
  onOpen: () => void;
}

function NoteRow({ text, detail, onOpen }: NoteRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={onOpen}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-3 text-[15px] leading-[21px] text-pretty break-words'>
          {text}
        </span>
        {detail && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-1 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default StyleNotes;
