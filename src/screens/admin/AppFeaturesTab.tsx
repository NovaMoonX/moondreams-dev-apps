import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from '@moondreamsdev/dreamer-ui/symbols';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import useNow from '@/hooks/useNow';
import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';
import { type AppUsage, getActiveSince } from '@lib/appUsage/appUsage';
import { appUsageQueryOptions } from '@lib/appUsage/appUsageQueries';
import {
  type FeatureGatesDoc,
  type GateDraft,
  type GateExceptionList,
  type GateRollout,
  readGateSetting,
  saveGateDraft,
} from '@lib/gates/featureGates';
import {
  type FeatureGateEntry,
  getAppFeatureGates,
} from '@lib/gates/gates.registry';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { startFeatureGatesListener } from '@store/listeners/featureGatesListener';

import { CARD_CLASS, LIST_CARD_CLASS } from './constants';

const PICKER_ROWS = 20;

const ROLLOUT_OPTIONS: { value: GateRollout; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'testing', label: 'Testing' },
  { value: 'everyone', label: 'Everyone' },
];

function countPeople(count: number) {
  return count === 1 ? '1 person' : `${count} people`;
}

function getGateSummary(
  rollout: GateRollout,
  givenCount: number,
  keptOutCount: number,
) {
  const label =
    ROLLOUT_OPTIONS.find((option) => option.value === rollout)?.label ??
    rollout;
  const given = givenCount > 0 ? `${givenCount} always given it` : null;
  const keptOut = keptOutCount > 0 ? `${keptOutCount} kept out` : null;
  return [label, given, keptOut].filter(Boolean).join(' · ');
}

function getRolloutHint(
  rollout: GateRollout,
  givenCount: number,
  keptOutCount: number,
) {
  const given =
    givenCount > 0 ? `, plus ${countPeople(givenCount)} always given it` : '';
  const keptOut =
    keptOutCount > 0 ? `, except ${countPeople(keptOutCount)} kept out` : '';
  if (rollout === 'everyone') return `Everyone has it${keptOut}.`;
  if (rollout === 'testing') return `Admins try it first${given}${keptOut}.`;
  return `Nobody has it${given}${keptOut}.`;
}

function getDraftChanges(
  before: GateDraft,
  after: GateDraft,
  nameOf: (uid: string) => string,
) {
  const listChanges = (
    list: GateExceptionList,
    addedTo: string,
    removedFrom: string,
  ) => [
    ...after[list]
      .filter((uid) => !before[list].includes(uid))
      .map((uid) => `${nameOf(uid)}: ${addedTo}`),
    ...before[list]
      .filter(
        (uid) =>
          !after[list].includes(uid) &&
          !after.alwaysOnUids.concat(after.alwaysOffUids).includes(uid),
      )
      .map((uid) => `${nameOf(uid)}: ${removedFrom}`),
  ];
  const rolloutLabel =
    ROLLOUT_OPTIONS.find((option) => option.value === after.rollout)?.label ??
    after.rollout;
  return [
    ...(after.rollout === before.rollout
      ? []
      : [`Who has it: ${rolloutLabel}`]),
    ...listChanges(
      'alwaysOnUids',
      'always given it',
      'no longer always given it',
    ),
    ...listChanges('alwaysOffUids', 'kept out', 'no longer kept out'),
  ];
}

interface OpenGate {
  gateId: string;
  before: GateDraft;
  draft: GateDraft;
}

interface AppFeaturesTabProps {
  app: AppMetadata;
  users: UserProfile[];
}

function AppFeaturesTab({ app, users }: AppFeaturesTabProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [gatesDoc, setGatesDoc] = useState<FeatureGatesDoc | null | undefined>(
    undefined,
  );
  const [opened, setOpened] = useState<OpenGate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const { confirm } = useActionModal();
  const usageQuery = useQuery(appUsageQueryOptions(app.id));
  const gates = getAppFeatureGates(app.id);

  useEffect(() => {
    if (uid === null) return;
    return startFeatureGatesListener(app.id, setGatesDoc);
  }, [app.id, uid]);

  const nameOf = (personUid: string) => {
    const profile = users.find((candidate) => candidate.uid === personUid);
    return profile?.displayName || profile?.email || personUid;
  };
  const changes = opened
    ? getDraftChanges(opened.before, opened.draft, nameOf)
    : [];
  const isDirty = changes.length > 0;
  const close = () => {
    setOpened(null);
    setError('');
  };
  const requestClose = useDiscardGuard({
    isDirty,
    isBusy: isSaving,
    onClose: close,
    title: 'Discard these changes?',
    message: "Nobody's access changes.",
  });

  if (gates.length === 0) {
    return (
      <div className={CARD_CLASS}>
        <p className='text-muted-foreground text-sm'>
          This app has no feature switches yet. A switch is added in code, then
          shows up here.
        </p>
      </div>
    );
  }

  const openGate = gates.find((gate) => gate.id === opened?.gateId) ?? null;

  const openSheet = (gateId: string) => {
    const { rollout, alwaysOnUids, alwaysOffUids } = readGateSetting(
      gatesDoc,
      app.id,
      gateId,
    );
    const before = { rollout, alwaysOnUids, alwaysOffUids };
    setOpened({ gateId, before, draft: before });
  };

  const save = async () => {
    if (!opened || !openGate) return;
    const isConfirmed = await confirm({
      title: `Save changes to ${openGate.label}?`,
      message: (
        <div className='space-y-3 text-left'>
          <ul className='list-disc space-y-1 pl-5'>
            {changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <p>People see it the next time they open or refresh the site.</p>
        </div>
      ),
      confirmText: 'Save',
      cancelText: 'Keep editing',
    });
    if (!isConfirmed) return;
    setIsSaving(true);
    setError('');
    try {
      await saveGateDraft(app.id, opened.gateId, opened.before, opened.draft);
      close();
    } catch (saveError) {
      console.error('Failed to save feature switch:', saveError);
      setError("Couldn't save those changes. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>
        Choose who gets each feature. People kept out never get it, whatever the
        rollout. A change reaches people the next time they open or refresh the
        site.
      </p>
      <ul className={LIST_CARD_CLASS}>
        {gates.map((gate) => {
          const setting = readGateSetting(gatesDoc, gate.appId, gate.id);
          return (
            <li key={gate.id}>
              <Button
                type='button'
                variant='tertiary'
                disabled={gatesDoc === undefined}
                className='h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
                onClick={() => openSheet(gate.id)}
              >
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm font-medium'>
                    {gate.label}
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {gatesDoc === undefined
                      ? 'Loading…'
                      : getGateSummary(
                          setting.rollout,
                          setting.alwaysOnUids.length,
                          setting.alwaysOffUids.length,
                        )}
                  </span>
                </span>
                <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
              </Button>
            </li>
          );
        })}
      </ul>
      <DetailSheet
        isOpen={opened !== null}
        onClose={requestClose}
        title={openGate?.label ?? 'Feature'}
        footer={
          opened ? (
            <div className='p-4'>
              <ModalFooterActions
                note={
                  error ||
                  (isDirty
                    ? `${changes.length === 1 ? '1 change' : `${changes.length} changes`} not saved yet`
                    : null)
                }
                cancelAction={
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={isSaving}
                    onClick={requestClose}
                  >
                    Cancel
                  </Button>
                }
                rightActions={
                  <Button
                    type='button'
                    disabled={!isDirty}
                    loading={isSaving}
                    onClick={() => void save()}
                  >
                    Save
                  </Button>
                }
              />
            </div>
          ) : null
        }
      >
        {openGate && opened ? (
          <GateControls
            gate={openGate}
            appName={app.name}
            users={users}
            usage={usageQuery.data}
            isUsageError={usageQuery.isError}
            draft={opened.draft}
            onDraftChange={(draft) =>
              setOpened((current) =>
                current ? { ...current, draft } : current,
              )
            }
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}

interface GateControlsProps {
  gate: FeatureGateEntry;
  appName: string;
  users: UserProfile[];
  usage: AppUsage[] | undefined;
  isUsageError: boolean;
  draft: GateDraft;
  onDraftChange: (draft: GateDraft) => void;
}

function GateControls({
  gate,
  appName,
  users,
  usage,
  isUsageError,
  draft,
  onDraftChange,
}: GateControlsProps) {
  const [picking, setPicking] = useState<GateExceptionList | null>(null);

  const addTo = (list: GateExceptionList, uid: string) => {
    const other: GateExceptionList =
      list === 'alwaysOnUids' ? 'alwaysOffUids' : 'alwaysOnUids';
    onDraftChange({
      ...draft,
      [list]: [...draft[list], uid],
      [other]: draft[other].filter((entry) => entry !== uid),
    });
  };

  const removeFrom = (list: GateExceptionList, uid: string) =>
    onDraftChange({
      ...draft,
      [list]: draft[list].filter((entry) => entry !== uid),
    });

  if (picking) {
    return (
      <PersonPicker
        appName={appName}
        title={picking === 'alwaysOnUids' ? 'Always give it to' : 'Keep out'}
        users={users}
        usage={usage}
        isUsageError={isUsageError}
        currentUids={draft[picking]}
        otherUids={
          picking === 'alwaysOnUids' ? draft.alwaysOffUids : draft.alwaysOnUids
        }
        otherLabel={
          picking === 'alwaysOnUids' ? 'Kept out now' : 'Always given it now'
        }
        onBack={() => setPicking(null)}
        onPick={(uid) => {
          addTo(picking, uid);
          setPicking(null);
        }}
      />
    );
  }

  return (
    <div className='space-y-5'>
      <p className='text-muted-foreground text-sm'>{gate.description}</p>

      <div className='space-y-2'>
        <div className='text-foreground text-sm font-medium'>Who has it</div>
        <PillGroup<GateRollout>
          label='Who has it'
          isThin
          value={draft.rollout}
          onChange={(rollout) => onDraftChange({ ...draft, rollout })}
          options={ROLLOUT_OPTIONS}
        />
        <p className='text-muted-foreground text-xs'>
          {getRolloutHint(
            draft.rollout,
            draft.alwaysOnUids.length,
            draft.alwaysOffUids.length,
          )}
        </p>
      </div>

      <ExceptionPeople
        title='Always given it'
        emptyText='Nobody'
        uids={draft.alwaysOnUids}
        users={users}
        onAdd={() => setPicking('alwaysOnUids')}
        onRemove={(uid) => removeFrom('alwaysOnUids', uid)}
      />
      <ExceptionPeople
        title='Kept out'
        emptyText='Nobody'
        uids={draft.alwaysOffUids}
        users={users}
        onAdd={() => setPicking('alwaysOffUids')}
        onRemove={(uid) => removeFrom('alwaysOffUids', uid)}
      />
    </div>
  );
}

interface ExceptionPeopleProps {
  title: string;
  emptyText: string;
  uids: string[];
  users: UserProfile[];
  onAdd: () => void;
  onRemove: (uid: string) => void;
}

function ExceptionPeople({
  title,
  emptyText,
  uids,
  users,
  onAdd,
  onRemove,
}: ExceptionPeopleProps) {
  const listed = uids.map(
    (uid) =>
      users.find((profile) => profile.uid === uid) ?? { uid, email: uid },
  );

  return (
    <div className='space-y-2'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='text-foreground text-sm font-medium'>{title}</span>
        <span className='text-muted-foreground text-xs'>
          {listed.length === 0 ? emptyText : countPeople(listed.length)}
        </span>
      </div>
      {listed.length > 0 ? (
        <ul className='divide-border/60 divide-y rounded-xl bg-zinc-50 px-3 dark:bg-zinc-800/60'>
          {listed.map((profile) => (
            <li
              key={profile.uid}
              className='flex items-center justify-between gap-3 py-2.5'
            >
              <div className='flex min-w-0 items-center gap-3'>
                <UserAvatar user={profile} size='sm' />
                <div className='min-w-0'>
                  <div className='text-foreground truncate text-sm'>
                    {profile.displayName || profile.email}
                  </div>
                  {profile.displayName ? (
                    <div className='text-muted-foreground truncate text-xs'>
                      {profile.email}
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                variant='tertiary'
                size='sm'
                className="relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
                aria-label={`Remove ${profile.displayName || profile.email}`}
                onClick={() => onRemove(profile.uid)}
              >
                <X className='h-4 w-4' />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        type='button'
        variant='tertiary'
        className='border-border text-muted-foreground h-10 w-full justify-center gap-1.5 rounded-xl border border-dashed text-sm font-normal'
        onClick={onAdd}
      >
        <Plus className='h-4 w-4' />
        Add someone
      </Button>
    </div>
  );
}

interface PersonPickerProps {
  appName: string;
  title: string;
  users: UserProfile[];
  usage: AppUsage[] | undefined;
  isUsageError: boolean;
  currentUids: string[];
  otherUids: string[];
  otherLabel: string;
  onBack: () => void;
  onPick: (uid: string) => void;
}

function PersonPicker({
  appName,
  title,
  users,
  usage,
  isUsageError,
  currentUids,
  otherUids,
  otherLabel,
  onBack,
  onPick,
}: PersonPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isShowingEveryone, setIsShowingEveryone] = useState(false);
  const now = useNow(60_000);
  const activeSince = getActiveSince(now);
  const term = searchTerm.trim().toLowerCase();

  const lastActiveByUid = useMemo(
    () =>
      new Map((usage ?? []).map((entry) => [entry.uid, entry.lastActiveAt])),
    [usage],
  );
  const matching = users.filter(
    (profile) =>
      !currentUids.includes(profile.uid) &&
      (term === '' ||
        profile.displayName?.toLowerCase().includes(term) ||
        profile.email?.toLowerCase().includes(term)),
  );
  const appPeople = matching
    .filter((profile) => lastActiveByUid.has(profile.uid))
    .sort(
      (a, b) =>
        (lastActiveByUid.get(b.uid) ?? 0) - (lastActiveByUid.get(a.uid) ?? 0),
    );
  const everyoneElse = matching.filter(
    (profile) => !lastActiveByUid.has(profile.uid),
  );
  const shown = isShowingEveryone ? [...appPeople, ...everyoneElse] : appPeople;

  const getSubtitle = (profile: UserProfile) => {
    if (otherUids.includes(profile.uid)) return `${otherLabel} · moves here`;
    const lastActiveAt = lastActiveByUid.get(profile.uid);
    if (lastActiveAt === undefined) return `Hasn't opened ${appName}`;
    return `${lastActiveAt >= activeSince ? 'Last active' : 'Quiet since'} ${formatDate(lastActiveAt)}`;
  };

  const getEmptyText = () => {
    if (isUsageError && !isShowingEveryone)
      return `Couldn't load who uses ${appName}. Show everyone instead.`;
    if (usage === undefined && !isShowingEveryone) return 'Loading…';
    if (term !== '') return 'Nobody matches that.';
    return isShowingEveryone
      ? 'Everyone is on this list already.'
      : `Nobody else has opened ${appName} yet.`;
  };

  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      <div className='space-y-1'>
        <h4 className='text-foreground text-base font-semibold'>{title}</h4>
        <p className='text-muted-foreground text-sm'>
          {isShowingEveryone
            ? `People who use ${appName} come first, most recently active at the top.`
            : `People who use ${appName}, most recently active first.`}
        </p>
      </div>
      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder='Search by name or email'
      />
      {shown.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{getEmptyText()}</p>
      ) : (
        <ul className='divide-border/60 divide-y'>
          {shown.slice(0, PICKER_ROWS).map((profile) => (
            <li key={profile.uid}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-14 w-full justify-start gap-3 rounded-none px-0! py-2.5 text-left font-normal'
                onClick={() => onPick(profile.uid)}
              >
                <UserAvatar user={profile} size='sm' />
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm'>
                    {profile.displayName || profile.email}
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {getSubtitle(profile)}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > PICKER_ROWS ? (
        <p className='text-muted-foreground text-center text-xs'>
          Showing {PICKER_ROWS} of {shown.length}. Search to find someone else.
        </p>
      ) : null}
      {!isShowingEveryone && everyoneElse.length > 0 ? (
        <ShowMoreButton onClick={() => setIsShowingEveryone(true)}>
          {term === '' || isUsageError
            ? `Show everyone (${everyoneElse.length} more)`
            : `Show ${everyoneElse.length} more who haven't opened ${appName}`}
        </ShowMoreButton>
      ) : null}
    </div>
  );
}

export default AppFeaturesTab;
