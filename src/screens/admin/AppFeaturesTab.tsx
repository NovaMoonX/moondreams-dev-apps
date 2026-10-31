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
  type FeatureGateSetting,
  type GateRollout,
  readGateSetting,
  saveGateSetting,
} from '@lib/gates/featureGates';
import { type FeatureGateEntry, getAppFeatureGates } from '@lib/gates/gates.registry';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { CARD_CLASS } from './constants';

const ROLLOUT_OPTIONS: { value: GateRollout; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'testing', label: 'Testing' },
  { value: 'everyone', label: 'Everyone' },
];

const ROLLOUT_HINTS: Record<GateRollout, string> = {
  off: 'Nobody has it, except people always given it below.',
  testing: 'Only you, plus people always given it below.',
  everyone: 'Everyone has it, except people kept out below.',
};

type ExceptionList = 'alwaysOnUids' | 'alwaysOffUids';

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

  const save = async (next: FeatureGateSetting) => {
    setError('');
    try {
      await saveGateSetting(gate.appId, gate.id, next);
    } catch (saveError) {
      console.error('Failed to save feature switch:', saveError);
      setError("Couldn't save that change. Check your connection.");
    }
  };

  const addTo = (list: ExceptionList, uid: string) => {
    const other: ExceptionList = list === 'alwaysOnUids' ? 'alwaysOffUids' : 'alwaysOnUids';
    void save({
      ...setting,
      [list]: [...setting[list], uid],
      [other]: setting[other].filter((entry) => entry !== uid),
    });
  };

  const removeFrom = (list: ExceptionList, uid: string) =>
    void save({ ...setting, [list]: setting[list].filter((entry) => entry !== uid) });

  return (
    <section className={join(CARD_CLASS, 'space-y-4')}>
      <div className='space-y-1'>
        <h4 className='text-foreground text-base font-semibold'>{gate.label}</h4>
        <p className='text-muted-foreground text-sm'>{gate.description}</p>
      </div>

      <div className='space-y-2'>
        <PillGroup<GateRollout>
          label='Who has it'
          isThin
          value={setting.rollout}
          onChange={(rollout) => void save({ ...setting, rollout })}
          options={ROLLOUT_OPTIONS}
        />
        <p className='text-muted-foreground text-xs'>{ROLLOUT_HINTS[setting.rollout]}</p>
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
        emptyText='Nobody. Being kept out wins over everything else.'
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
