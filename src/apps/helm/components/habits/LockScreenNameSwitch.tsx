import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { LockOpen } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import { setLockScreenName } from '@apps/helm/store/actions/habitActions';
import type { OpenHabit } from '@apps/helm/types';

interface LockScreenNameSwitchProps {
  habit: OpenHabit;
}

/** "Show its name on the lock screen": off by default, and turning it on first says plainly that the name is kept readable and who can see it. Off is one tap. */
function LockScreenNameSwitch({ habit }: LockScreenNameSwitchProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const isOn = habit.lockScreenName !== null;

  const change = async (isShown: boolean) => {
    if (!user) return;
    if (isShown) {
      const isConfirmed = await confirm({
        title: HELM_COPY.lockScreenNameConfirmTitle,
        message:
          habit.privacy === 'private' || habit.isCare
            ? `${HELM_COPY.lockScreenNameWarning} ${HELM_COPY.lockScreenNamePrivate(habit.name)}`
            : HELM_COPY.lockScreenNameWarning,
        confirmText: HELM_COPY.lockScreenNameConfirmAction,
        cancelText: HELM_COPY.lockScreenNameConfirmKeep,
      });
      if (!isConfirmed) return;
    }
    setLockScreenName(user.uid, habit, isShown).written.catch(
      (error: unknown) => {
        console.error('Helm lock screen name was not changed', error);
        addToast({ title: HELM_COPY.lockScreenNameFailed, type: 'error' });
      },
    );
    addToast({
      title: isShown
        ? HELM_COPY.lockScreenNameShownToast(habit.name)
        : HELM_COPY.lockScreenNameHiddenToast(habit.name),
      type: 'success',
    });
  };

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-foreground text-[15px] leading-[21px] font-medium'>
            {HELM_COPY.lockScreenNameTitle}
          </p>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.lockScreenNameOff(HELM_COPY.lockScreenNameOffWords)}
          </p>
          <p className='text-muted-foreground text-[13px] break-words'>
            {HELM_COPY.lockScreenNameOn(habit.name)}
          </p>
        </div>
        <AppToggle
          checked={isOn}
          onCheckedChange={(isShown) => void change(isShown)}
          aria-label={HELM_COPY.lockScreenNameTitle}
        />
      </div>
      <p className='text-muted-foreground flex gap-2 text-[13px] text-pretty'>
        <LockOpen className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
        <span>{HELM_COPY.lockScreenNameWarning}</span>
      </p>
    </div>
  );
}

export default LockScreenNameSwitch;
