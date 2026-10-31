import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { X } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import { PillGroup } from '@/components/PillGroup';
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

import { CARD_CLASS } from './constants';

const ROLLOUT_OPTIONS: { value: GateRollout; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'testing', label: 'Testing' },
  { value: 'everyone', label: 'Everyone' },
];

function countPeople(count: number) {
  return count === 1 ? '1 person' : `${count} people`;
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

  return (
    <div className='space-y-4'>
      {gates.map((gate) => (
        <GateCard key={gate.id} gate={gate} users={users} />
      ))}
    </div>
  );
}

interface GateCardProps {
  gate: FeatureGateEntry;
  users: UserProfile[];
}

function GateCard({ gate, users }: GateCardProps) {
  const gatesDoc = useAppSelector((state) => state.featureGates.byApp[gate.appId]);
  const setting = readGateSetting(gatesDoc, gate.appId, gate.id);
  const [error, setError] = useState('');

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

  return (
    <section className={join(CARD_CLASS, 'space-y-4')}>
      <div className='space-y-1'>
        <h4 className='text-foreground text-base font-semibold'>{gate.label}</h4>
        <p className='text-muted-foreground text-sm'>{gate.description}</p>
      </div>

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
        emptyText='Nobody yet.'
        uids={setting.alwaysOnUids}
        users={users}
        onAdd={(uid) => addTo('alwaysOnUids', uid)}
        onRemove={(uid) => removeFrom('alwaysOnUids', uid)}
      />
      <ExceptionPeople
        title='Kept out'
        emptyText='Nobody. Kept out wins over everything else.'
        uids={setting.alwaysOffUids}
        users={users}
        onAdd={(uid) => addTo('alwaysOffUids', uid)}
        onRemove={(uid) => removeFrom('alwaysOffUids', uid)}
      />

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
    </section>
  );
}

interface ExceptionPeopleProps {
  title: string;
  emptyText: string;
  uids: string[];
  users: UserProfile[];
  onAdd: (uid: string) => void;
  onRemove: (uid: string) => void;
}

function ExceptionPeople({ title, emptyText, uids, users, onAdd, onRemove }: ExceptionPeopleProps) {
  const listed = uids.map(
    (uid) => users.find((profile) => profile.uid === uid) ?? { uid, email: uid },
  );
  const addable = users.filter((profile) => !uids.includes(profile.uid));

  return (
    <div className='space-y-2'>
      <div className='text-foreground text-sm font-medium'>{title}</div>
      {listed.length === 0 ? (
        <p className='text-muted-foreground text-xs'>{emptyText}</p>
      ) : (
        <div className='divide-border divide-y'>
          {listed.map((profile) => (
            <div key={profile.uid} className='flex items-center justify-between gap-3 py-2'>
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
            </div>
          ))}
        </div>
      )}
      <Select
        searchable
        searchPlaceholder='Search by name or email'
        placeholder='Add someone'
        options={addable.map((profile) => ({
          value: profile.uid,
          text: profile.displayName || profile.email,
          description: profile.displayName ? profile.email : undefined,
        }))}
        value=''
        onChange={(uid) => {
          if (uid) onAdd(uid);
        }}
      />
    </div>
  );
}

export default AppFeaturesTab;
