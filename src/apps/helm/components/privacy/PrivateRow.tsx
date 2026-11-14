import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { HeartHandshake, Stethoscope } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import PrivateSwitchLine from '@apps/helm/components/privacy/PrivateSwitchLine';
import { setPrivate } from '@apps/helm/store/actions/privacyActions';
import { selectParentIndex } from '@apps/helm/store/selectors/privacySelectors';
import {
  needsClearConfirm,
  readInheritedFrom,
  readPrivacyFacts,
} from '@apps/helm/utils/privacy';
import {
  parentsOf,
  type PrivacyRecord,
  type PrivateKind,
} from '@apps/helm/utils/privacyParents';

interface PrivateRowProps {
  kind: PrivateKind;
  record: PrivacyRecord;
  title: string;
  /** Opens the project, person or place an inherited class comes from; left out, the row opens its page. */
  onOpenParent?: (parentId: string) => void;
}

/** The Private switch every record's sheet carries: immediate, never locked, and it says why when the class is not the person's own. */
function PrivateRow({ kind, record, title, onOpenParent }: PrivateRowProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const name = useAssistantName();
  const index = useAppSelector(selectParentIndex);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isWriting, setIsWriting] = useState(false);
  const facts = readPrivacyFacts(record);
  const inherited = readInheritedFrom(parentsOf(kind, record, index));
  const openParent = (parentId: string) => {
    if (onOpenParent) return onOpenParent(parentId);
    const view = index.project.has(parentId)
      ? 'project'
      : index.who.has(parentId)
        ? 'who'
        : 'place';
    afterBackLayersClose(() =>
      navigate(`${pathname}?view=${view}&item=${encodeURIComponent(parentId)}`),
    );
  };
  const isOwn = facts.privateMark !== null || facts.isCare === true;
  const isOn = isOwn || inherited !== null;
  const codeMark =
    facts.privateMark === 'health' || facts.privateMark === 'care'
      ? facts.privateMark
      : facts.isCare
        ? 'care'
        : null;

  const write = async (isPrivate: boolean) => {
    if (!user || isWriting) return;
    setIsWriting(true);
    try {
      const result = await setPrivate(user.uid, kind, record.id, isPrivate);
      if (result.kind === 'refused')
        addToast({
          title: inherited
            ? HELM_COPY.privateStillBecause(inherited.name)
            : result.line,
          type: 'info',
        });
      else if (result.kind === 'saved' && result.isCascadeIncomplete)
        addToast({ title: HELM_COPY.privateCascadePartial, type: 'error' });
      else if (result.kind === 'offline')
        addToast({ title: HELM_COPY.privateNeedsConnection, type: 'info' });
      else if (result.kind !== 'saved' && result.kind !== 'unchanged')
        addToast({ title: HELM_COPY.privateFailed, type: 'error' });
    } catch (error) {
      console.error('Helm private switch did not save', error);
      addToast({ title: HELM_COPY.privateFailed, type: 'error' });
    } finally {
      setIsWriting(false);
    }
  };

  const clear = async () => {
    if (codeMark === null) return write(false);
    const isConfirmed = await confirm({
      title: HELM_COPY.privateClearTitle,
      message: HELM_COPY.privateClearMessage(title, name, codeMark),
      confirmText: HELM_COPY.privateClearAction,
      cancelText: HELM_COPY.privateKeep,
    });
    if (isConfirmed) await write(false);
  };

  const onChange = (isPrivate: boolean) =>
    isPrivate || !needsClearConfirm(facts) ? write(isPrivate) : clear();

  const Mark = codeMark === 'care' ? HeartHandshake : Stethoscope;
  return (
    <div className='border-border mt-3 border-t pt-3'>
      <PrivateSwitchLine checked={isOn} onCheckedChange={onChange} />
      {codeMark !== null && (
        <div className='text-muted-foreground mt-2 flex items-center gap-2 text-[13px]'>
          <Mark className='size-3.5 shrink-0' aria-hidden='true' />
          <p className='min-w-0 flex-1'>
            {codeMark === 'care'
              ? HELM_COPY.privateMarkedCare
              : HELM_COPY.privateMarkedHealth}
          </p>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='relative shrink-0 after:absolute after:-inset-2 after:content-[""]'
            onClick={clear}
          >
            {HELM_COPY.privateChange}
          </Button>
        </div>
      )}
      {inherited !== null && (
        <div className='text-muted-foreground mt-2 flex items-center gap-2 text-[13px]'>
          <p className='min-w-0 flex-1'>
            {HELM_COPY.privateFromParent(inherited.name)}
          </p>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='relative shrink-0 after:absolute after:-inset-2 after:content-[""]'
            onClick={() => openParent(inherited.id)}
          >
            {HELM_COPY.privateOpenParent}
          </Button>
        </div>
      )}
    </div>
  );
}

export default PrivateRow;
