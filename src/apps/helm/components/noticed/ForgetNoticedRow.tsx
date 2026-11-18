import { Eraser } from 'lucide-react';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  finishForget,
  forgetAllNoticed,
  undoForgetAll,
} from '@apps/helm/store/actions/patternActions';
import { UNDO_WINDOW_MS } from '@/lib/undo';

/** "Forget what you've noticed": hides everything at once with an Undo in the toast; the deletion follows when the toast has closed, unless Undo put the old stamp back (and at the next daily check if the app closed first). */
function ForgetNoticedRow() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const previous = useAppSelector(
    (state) => state.helm.profile?.forgottenAt ?? null,
  );

  const forget = () => {
    if (!user) return;
    const uid = user.uid;
    forgetAllNoticed(uid, previous)
      .then((stamp) => {
        addToast({
          duration: UNDO_WINDOW_MS,
          title: HELM_COPY.noticedForgotten,
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () => {
              void undoForgetAll(uid, stamp)
                .then(() =>
                  addToast({
                    title: HELM_COPY.noticedForgotUndone,
                    type: 'info',
                  }),
                )
                .catch((error: unknown) => {
                  console.error('Helm forget was not undone', error);
                  addToast({
                    title: HELM_COPY.noticedOfferFailed,
                    type: 'error',
                  });
                });
            },
          },
        });
        window.setTimeout(
          () =>
            void finishForget(uid, stamp).catch((error: unknown) =>
              console.error('Helm forget was not finished', error),
            ),
          UNDO_WINDOW_MS,
        );
      })
      .catch((error: unknown) => {
        console.error('Helm noticed was not forgotten', error);
        addToast({ title: HELM_COPY.noticedOfferFailed, type: 'error' });
      });
  };

  return (
    <ActionRow
      icon={<Eraser />}
      label={HELM_COPY.noticedForget}
      subtitle={HELM_COPY.noticedForgetSubtitle}
      isDestructive
      onClick={forget}
    />
  );
}

export default ForgetNoticedRow;
