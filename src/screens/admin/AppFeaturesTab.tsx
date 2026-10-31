import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from '@moondreamsdev/dreamer-ui/symbols';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureGatesSync } from '@/hooks/useFeatureGates';
import { useAppSelector } from '@/store';
import UserAvatar from '@/ui/UserAvatar';
import {
  addGateException,
  type GateExceptionList,
  type GateRollout,
  readGateSetting,
  removeGateException,
  saveGateRollout,
} from '@lib/gates/featureGates';
import { type FeatureGateEntry, getAppFeatureGates } from '@lib/gates/gates.registry';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

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

function getGateSummary(rollout: GateRollout, givenCount: number, keptOutCount: number) {
  const label = ROLLOUT_OPTIONS.find((option) => option.value === rollout)?.label ?? rollout;
  const given = givenCount > 0 ? `${givenCount} always given it` : null;
  const keptOut = keptOutCount > 0 ? `${keptOutCount} kept out` : null;
  return [label, given, keptOut].filter(Boolean).join(' · ');
}

function getRolloutHint(rollout: GateRollout, givenCount: number, keptOutCount: number) {
  const given = givenCount > 0 ? `, plus ${countPeople(givenCount)} always given it` : '';
  const keptOut = keptOutCount > 0 ? `, except ${countPeople(keptOutCount)} kept out` : '';
  if (rollout === 'everyone') return `Everyone has it${keptOut}.`;
  if (rollout === 'testing') return `Admins try it first${given}${keptOut}.`;
  return `Nobody has it${given}${keptOut}.`;
}

interface AppFeaturesTabProps {
  app: AppMetadata;
  users: UserProfile[];
}

function AppFeaturesTab({ app, users }: AppFeaturesTabProps) {
  const { user } = useAuth();
  useFeatureGatesSync(app.id, user?.uid ?? null);
  const gatesDoc = useAppSelector((state) => state.featureGates.byApp[app.id]);
  const [openGateId, setOpenGateId] = useState<string | null>(null);
  const gates = getAppFeatureGates(app.id);

  if (gates.length === 0) {
    return (
      <div className={CARD_CLASS}>
        <p className='text-muted-foreground text-sm'>
          This app has no feature switches yet. A switch is added in code, then shows up here.
        </p>
      </div>
    );
  }

  const openGate = gates.find((gate) => gate.id === openGateId) ?? null;

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>
        Choose who gets each feature. People kept out never get it, whatever the rollout.
      </p>
      <ul className={LIST_CARD_CLASS}>
        {gates.map((gate) => {
          const setting = readGateSetting(gatesDoc, gate.appId, gate.id);
          return (
            <li key={gate.id}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
                onClick={() => setOpenGateId(gate.id)}
              >
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm font-medium'>
                    {gate.label}
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {getGateSummary(setting.rollout, setting.alwaysOnUids.length, setting.alwaysOffUids.length)}
                  </span>
                </span>
                <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
              </Button>
            </li>
          );
        })}
      </ul>
      <DetailSheet
        isOpen={openGate !== null}
        onClose={() => setOpenGateId(null)}
        title={openGate?.label ?? 'Feature'}
      >
        {openGate ? <GateControls gate={openGate} users={users} /> : null}
      </DetailSheet>
    </div>
  );
}

interface GateControlsProps {
  gate: FeatureGateEntry;
  users: UserProfile[];
}

function GateControls({ gate, users }: GateControlsProps) {
  const gatesDoc = useAppSelector((state) => state.featureGates.byApp[gate.appId]);
  const setting = readGateSetting(gatesDoc, gate.appId, gate.id);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<GateExceptionList | null>(null);

  const run = async (write: Promise<void>) => {
    setError('');
    try {
      await write;
    } catch (saveError) {
      console.error('Failed to save feature switch:', saveError);
      setError("Couldn't save that change. Check your connection.");
    }
  };

  const addTo = (list: GateExceptionList, uid: string) =>
    void run(addGateException(gate.appId, gate.id, list, uid));

  const removeFrom = (list: GateExceptionList, uid: string) =>
    void run(removeGateException(gate.appId, gate.id, list, uid));

  if (picking) {
    return (
      <PersonPicker
        title={picking === 'alwaysOnUids' ? 'Always give it to' : 'Keep out'}
        users={users}
        currentUids={setting[picking]}
        otherUids={picking === 'alwaysOnUids' ? setting.alwaysOffUids : setting.alwaysOnUids}
        otherLabel={picking === 'alwaysOnUids' ? 'Kept out now' : 'Always given it now'}
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
          value={setting.rollout}
          onChange={(rollout) => void run(saveGateRollout(gate.appId, gate.id, rollout))}
          options={ROLLOUT_OPTIONS}
        />
        <p className='text-muted-foreground text-xs'>
          {getRolloutHint(setting.rollout, setting.alwaysOnUids.length, setting.alwaysOffUids.length)}
        </p>
      </div>

      <ExceptionPeople
        title='Always given it'
        emptyText='Nobody'
        uids={setting.alwaysOnUids}
        users={users}
        onAdd={() => setPicking('alwaysOnUids')}
        onRemove={(uid) => removeFrom('alwaysOnUids', uid)}
      />
      <ExceptionPeople
        title='Kept out'
        emptyText='Nobody'
        uids={setting.alwaysOffUids}
        users={users}
        onAdd={() => setPicking('alwaysOffUids')}
        onRemove={(uid) => removeFrom('alwaysOffUids', uid)}
      />

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
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

function ExceptionPeople({ title, emptyText, uids, users, onAdd, onRemove }: ExceptionPeopleProps) {
  const listed = uids.map(
    (uid) => users.find((profile) => profile.uid === uid) ?? { uid, email: uid },
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
            <li key={profile.uid} className='flex items-center justify-between gap-3 py-2.5'>
              <div className='flex min-w-0 items-center gap-3'>
                <UserAvatar user={profile} size='sm' />
                <div className='min-w-0'>
                  <div className='text-foreground truncate text-sm'>
                    {profile.displayName || profile.email}
                  </div>
                  {profile.displayName ? (
                    <div className='text-muted-foreground truncate text-xs'>{profile.email}</div>
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
  title: string;
  users: UserProfile[];
  currentUids: string[];
  otherUids: string[];
  otherLabel: string;
  onBack: () => void;
  onPick: (uid: string) => void;
}

function PersonPicker({
  title,
  users,
  currentUids,
  otherUids,
  otherLabel,
  onBack,
  onPick,
}: PersonPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const term = searchTerm.trim().toLowerCase();
  const shown = users.filter(
    (profile) =>
      !currentUids.includes(profile.uid) &&
      (term === '' ||
        profile.displayName?.toLowerCase().includes(term) ||
        profile.email?.toLowerCase().includes(term)),
  );

  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      <h4 className='text-foreground text-base font-semibold'>{title}</h4>
      <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder='Search by name or email' />
      {shown.length === 0 ? (
        <p className='text-muted-foreground text-sm'>Nobody matches that.</p>
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
                    {otherUids.includes(profile.uid) ? `${otherLabel} · moves here` : profile.email}
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
    </div>
  );
}

export default AppFeaturesTab;
