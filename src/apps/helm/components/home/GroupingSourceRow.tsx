import AppLogo from '@/components/AppLogo';
import { readConnectorAppId } from '@/lib/connections/contract';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { GroupingSource } from '@apps/helm/engine/grouping';

interface GroupingSourceRowProps {
  source: GroupingSource;
  title: string | undefined;
}

const ownLineOf = (key: string) => {
  const from = key.slice(0, key.indexOf('/'));
  return from === 'notes'
    ? HELM_COPY.groupingYourNote
    : from === 'topics'
      ? HELM_COPY.groupingYourTopic
      : from === 'projects'
        ? HELM_COPY.groupingYourProject
        : HELM_COPY.groupingYourTask;
};

function GroupingSourceRow({ source, title }: GroupingSourceRowProps) {
  const name = useAssistantName();
  const { nameOf } = useSourceAppName();
  const appId = source.app ? readConnectorAppId(source.app) : null;

  return (
    <li className='flex min-w-0 items-center gap-3'>
      <span className='flex size-6 shrink-0 items-center justify-center'>
        {source.app === null ? (
          <AssistantMark name={name} isOnTint />
        ) : (
          <AppLogo appId={appId ?? ''} className='size-5 rounded-md' />
        )}
      </span>
      <div className='min-w-0'>
        <p className='truncate text-[15px] leading-[21px]'>
          {title?.trim() || HELM_COPY.groupingPrivateItem}
        </p>
        <p className='text-muted-foreground truncate text-[13px]'>
          {source.app === null
            ? ownLineOf(source.key)
            : HELM_COPY.groupingFromApp(nameOf(source.app))}
        </p>
      </div>
    </li>
  );
}

export default GroupingSourceRow;
