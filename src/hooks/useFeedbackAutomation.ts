import { useEffect, useState } from 'react';

import { startFeedbackAutomationListener } from '@/store/listeners/feedbackListeners';

/** Whether Claude works on feedback by itself; null until known. Admin only. */
export function useFeedbackAutomation(isEnabled: boolean): {
  isOn: boolean | null;
} {
  const [isOn, setIsOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isEnabled) return;
    return startFeedbackAutomationListener(setIsOn, (error) => {
      console.error('Failed to load the feedback automation switch:', error);
      setIsOn(null);
    });
  }, [isEnabled]);

  return { isOn: isEnabled ? isOn : null };
}
