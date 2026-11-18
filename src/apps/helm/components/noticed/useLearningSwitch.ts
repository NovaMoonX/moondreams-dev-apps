import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setLearningOn } from '@apps/helm/store/actions/settingsActions';

/** The "Notice what works for me" switch: on from the start, turning it off asks first, and it writes at once without locking anything else. */
export function useLearningSwitch() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const assistant = useAssistantName();
  const isOn = useAppSelector(
    (state) => state.helm.profile?.isLearningOn ?? true,
  );

  const change = async (checked: boolean) => {
    if (!user) return;
    if (!checked) {
      const isConfirmed = await confirm({
        title: HELM_COPY.learningOffTitle,
        message: HELM_COPY.learningOffBody(assistant),
        confirmText: HELM_COPY.learningTurnOff,
        cancelText: HELM_COPY.learningKeep,
      });
      if (!isConfirmed) return;
    }
    setLearningOn(user.uid, checked).catch((error: unknown) => {
      console.error('Helm learning switch was not saved', error);
      addToast({ title: HELM_COPY.learningFailed, type: 'error' });
    });
  };

  return { isOn, change: (checked: boolean) => void change(checked) };
}
